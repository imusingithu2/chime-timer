/* Tiny static server for testing on your own computer. Node built-ins only.
   Binds to 127.0.0.1 ONLY (not reachable from other devices). Usage: node tools/serve.cjs [port]
   Open http://127.0.0.1:8080/chime-timer/ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = '/chime-timer/';
const PORT = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.wav': 'audio/wav', '.svg': 'image/svg+xml'
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/') { res.writeHead(302, { Location: BASE }); return res.end(); }
  if (!p.startsWith(BASE)) { res.writeHead(404); return res.end('Not found'); }
  let rel = p.slice(BASE.length) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    if (m && (m[1] || m[2])) {
      const start = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]);
      const end = m[1] === '' || m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1);
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, Object.assign(head, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }));
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, Object.assign(head, { 'Content-Length': st.size }));
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => console.log('Chime Timer: http://127.0.0.1:' + PORT + BASE));
