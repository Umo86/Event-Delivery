// Local stand-in for the Vercel Blob API, used only for automated tests and local development.
// Implements the endpoints the @vercel/blob SDK calls: single PUT, multipart (mpu), head, list, delete,
// plus serving stored files. Production uses the real Vercel Blob service.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function startFakeBlob({ port = 54400, dir = '.local/blob', rwToken }) {
  fs.mkdirSync(dir, { recursive: true });
  const metaFile = path.join(dir, '_meta.json');
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { meta = {}; }
  const saveMeta = () => fs.writeFileSync(metaFile, JSON.stringify(meta));
  const mpu = new Map(); // uploadId -> { pathname, parts: Map<number, Buffer>, opts }
  const base = `http://127.0.0.1:${port}`;
  const secret = rwToken.split('_').slice(4).join('_'); // vercel_blob_rw_<store>_<secret>

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS,HEAD',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': '*',
  };
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', ...cors });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  // Validate bearer token: either the read-write token or a client token signed with it.
  function auth(req) {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (token === rwToken) return { kind: 'rw', opts: {} };
    if (token.startsWith('vercel_blob_client_')) {
      const rest = token.split('_').slice(4).join('_');
      const decoded = Buffer.from(rest, 'base64').toString();
      const dot = decoded.indexOf('.');
      const sig = decoded.slice(0, dot);
      const payload = decoded.slice(dot + 1);
      const expected = crypto.createHmac('sha256', rwToken).update(payload).digest('hex');
      if (sig !== expected) return null;
      const opts = JSON.parse(Buffer.from(payload, 'base64').toString());
      if (opts.validUntil && Date.now() > opts.validUntil) return null;
      return { kind: 'client', opts };
    }
    return null;
  }

  function storeBlob(pathnameIn, buf, headers, opts) {
    let pathname = pathnameIn;
    const addRandom = opts.addRandomSuffix ?? (headers['x-add-random-suffix'] === '1');
    if (addRandom) {
      const ext = path.extname(pathname);
      const stem = ext ? pathname.slice(0, -ext.length) : pathname;
      pathname = `${stem}-${crypto.randomBytes(15).toString('base64url').replace(/[-_]/g, 'x').slice(0, 30)}${ext}`;
    }
    if (opts.pathname && opts.pathname !== pathnameIn) throw Object.assign(new Error('pathname mismatch'), { code: 'forbidden' });
    const contentType = headers['x-content-type'] || opts.contentType || 'application/octet-stream';
    if (opts.allowedContentTypes && !opts.allowedContentTypes.some((t) => t === contentType || (t.endsWith('/*') && contentType.startsWith(t.slice(0, -1))))) {
      throw Object.assign(new Error(`Content type ${contentType} is not allowed`), { code: 'content_type_not_allowed' });
    }
    if (opts.maximumSizeInBytes && buf.length > opts.maximumSizeInBytes) {
      throw Object.assign(new Error('File is too large'), { code: 'file_too_large' });
    }
    const allowOverwrite = opts.allowOverwrite ?? (headers['x-allow-overwrite'] === '1');
    if (meta[pathname] && !allowOverwrite) throw Object.assign(new Error('This blob already exists'), { code: 'bad_request' });
    const file = path.join(dir, encodeURIComponent(pathname));
    fs.writeFileSync(file, buf);
    const access = headers['x-vercel-blob-access'] || 'public';
    const etag = '"' + crypto.createHash('md5').update(buf).digest('hex') + '"';
    meta[pathname] = { pathname, size: buf.length, contentType, access, uploadedAt: new Date().toISOString(), etag };
    saveMeta();
    const url = `${base}/blobs/${pathname}`;
    return { url, downloadUrl: `${url}?download=1`, pathname, contentType, contentDisposition: `inline; filename="${path.basename(pathname)}"`, etag };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, base);
      if (req.method === 'OPTIONS') {
        // "*" doesn't cover the Authorization header in CORS, so echo back exactly what the browser asks for.
        res.writeHead(204, { ...cors, 'access-control-allow-headers': req.headers['access-control-request-headers'] || '*', 'access-control-max-age': '600' });
        return res.end();
      }

      // Serve stored files
      if (u.pathname.startsWith('/blobs/')) {
        const pathname = decodeURIComponent(u.pathname.slice('/blobs/'.length));
        const m = meta[pathname];
        if (!m) { res.writeHead(404, cors); return res.end('not found'); }
        if (m.access === 'private' && !auth(req)) { res.writeHead(403, cors); return res.end('forbidden'); }
        const buf = fs.readFileSync(path.join(dir, encodeURIComponent(pathname)));
        res.writeHead(200, { 'content-type': m.contentType, 'content-length': buf.length, etag: m.etag, 'last-modified': new Date(m.uploadedAt).toUTCString(), ...cors });
        return res.end(req.method === 'HEAD' ? undefined : buf);
      }

      if (!u.pathname.startsWith('/api/blob')) { res.writeHead(404, cors); return res.end(); }
      const sub = u.pathname.slice('/api/blob'.length) || '/';
      const a = auth(req);
      if (!a) return json(res, 403, { error: { code: 'forbidden', message: 'Access denied, please provide a valid token for this resource.' } });

      if (req.method === 'PUT' && sub === '/') {
        const pathname = u.searchParams.get('pathname');
        const buf = await readBody(req);
        try { return json(res, 200, storeBlob(pathname, buf, req.headers, a.opts)); }
        catch (e) { return json(res, 400, { error: { code: e.code || 'bad_request', message: e.message } }); }
      }
      if (req.method === 'POST' && sub === '/mpu') {
        const action = req.headers['x-mpu-action'];
        const pathname = u.searchParams.get('pathname');
        if (action === 'create') {
          const uploadId = crypto.randomUUID();
          mpu.set(uploadId, { pathname, parts: new Map() });
          return json(res, 200, { uploadId, key: pathname });
        }
        const uploadId = req.headers['x-mpu-upload-id'];
        const entry = mpu.get(uploadId);
        if (!entry) return json(res, 404, { error: { code: 'not_found', message: 'upload not found' } });
        if (action === 'upload') {
          const n = Number(req.headers['x-mpu-part-number']);
          const buf = await readBody(req);
          entry.parts.set(n, buf);
          return json(res, 200, { etag: `"part-${n}"` });
        }
        if (action === 'complete') {
          const partsList = JSON.parse((await readBody(req)).toString());
          const buf = Buffer.concat(partsList.sort((x, y) => x.partNumber - y.partNumber).map((p) => entry.parts.get(p.partNumber)));
          mpu.delete(uploadId);
          try { return json(res, 200, storeBlob(entry.pathname, buf, req.headers, a.opts)); }
          catch (e) { return json(res, 400, { error: { code: e.code || 'bad_request', message: e.message } }); }
        }
      }
      if (req.method === 'POST' && sub === '/delete') {
        const { urls } = JSON.parse((await readBody(req)).toString());
        for (const x of urls) {
          const pathname = x.startsWith('http') ? decodeURIComponent(new URL(x).pathname.replace(/^\/blobs\//, '')) : x;
          if (meta[pathname]) {
            try { fs.unlinkSync(path.join(dir, encodeURIComponent(pathname))); } catch {}
            delete meta[pathname];
          }
        }
        saveMeta();
        return json(res, 200, {});
      }
      if (req.method === 'GET' && sub === '/') {
        const target = u.searchParams.get('url');
        if (target) {
          const pathname = target.startsWith('http') ? decodeURIComponent(new URL(target).pathname.replace(/^\/blobs\//, '')) : target;
          const m = meta[pathname];
          if (!m) return json(res, 404, { error: { code: 'not_found', message: 'The requested blob does not exist' } });
          const url = `${base}/blobs/${pathname}`;
          return json(res, 200, { url, downloadUrl: `${url}?download=1`, pathname, size: m.size, uploadedAt: m.uploadedAt, contentType: m.contentType, contentDisposition: `inline; filename="${path.basename(pathname)}"`, cacheControl: 'public, max-age=2592000', etag: m.etag });
        }
        const prefix = u.searchParams.get('prefix') || '';
        const blobs = Object.values(meta).filter((m) => m.pathname.startsWith(prefix)).map((m) => ({
          url: `${base}/blobs/${m.pathname}`, downloadUrl: `${base}/blobs/${m.pathname}?download=1`, pathname: m.pathname, size: m.size, uploadedAt: m.uploadedAt, etag: m.etag,
        }));
        return json(res, 200, { blobs, cursor: undefined, hasMore: false });
      }
      return json(res, 400, { error: { code: 'bad_request', message: `unsupported ${req.method} ${sub}` } });
    } catch (e) {
      json(res, 500, { error: { code: 'unknown_error', message: String(e?.message || e) } });
    }
  });
  void secret;
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
