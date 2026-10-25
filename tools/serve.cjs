const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const HOST = '127.0.0.1';
const PREFIX = '/chime-timer';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.wav': 'audio/wav',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  const url = req.url;
  if (!url.startsWith(PREFIX)) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  let relativePath = url.substring(PREFIX.length);
  if (relativePath === '/' || relativePath === '') {
    relativePath = '/index.html';
  }

  const filePath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('File Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (e) {
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}${PREFIX}`);
});
