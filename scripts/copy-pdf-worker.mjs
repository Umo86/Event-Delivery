// Copies the PDF.js worker (legacy build, for older browsers too) into /public so the browser can render PDF previews of uploaded artwork.
import fs from 'node:fs';
import path from 'node:path';
const src = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
const dest = path.join(process.cwd(), 'public', 'pdf.worker.min.mjs');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('Copied PDF.js worker to public/');
