// Local stand-in for Resend's email API, used only for automated tests and local development.
//   POST /emails   stores the message (the same request the app sends to Resend)
//   GET  /outbox   lists everything "sent", newest last
//   DELETE /outbox clears it
// A recipient containing "fail@" is refused the way Resend refuses mail from an unverified sender.
import http from 'node:http';
import crypto from 'node:crypto';

export function startFakeEmail({ port = 54500, apiKey }) {
  const outbox = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && url.pathname === '/outbox') return send(200, outbox);
    if (req.method === 'DELETE' && url.pathname === '/outbox') {
      outbox.length = 0;
      return send(200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/emails') {
      if (req.headers.authorization !== `Bearer ${apiKey}`) {
        return send(401, { statusCode: 401, name: 'missing_api_key', message: 'Missing API key in the authorization header' });
      }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(422, { statusCode: 422, name: 'validation_error', message: 'Invalid JSON' });
      }
      const to = [].concat(body.to ?? []);
      if (!body.from || !to.length || !body.subject) {
        return send(422, { statusCode: 422, name: 'validation_error', message: 'Missing `from`, `to` or `subject`.' });
      }
      if (to.some((t) => /fail@/i.test(String(t)))) {
        return send(403, {
          statusCode: 403,
          name: 'validation_error',
          message: 'You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain.',
        });
      }
      const id = crypto.randomUUID();
      outbox.push({ id, ...body, to, created_at: new Date().toISOString() });
      return send(200, { id });
    }
    return send(404, { message: 'Not found' });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
