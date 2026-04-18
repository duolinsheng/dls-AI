const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const OLLAMA_URL = 'http://127.0.0.1:11434';

const proxy = httpProxy.createProxyServer({
  target: OLLAMA_URL,
  changeOrigin: true,
});

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    console.log(`[Proxy] ${req.method} ${req.url} -> ${OLLAMA_URL}${req.url}`);
    proxy.web(req, res, { target: OLLAMA_URL });
    return;
  }

  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
  console.log(`Proxying /api/* to ${OLLAMA_URL}`);
});
