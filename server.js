const http = require("http");
let httpProxy;
try {
  httpProxy = require("http-proxy");
} catch {
  // 兼容仅安装了 main/node_modules 的场景
  httpProxy = require("./main/node_modules/http-proxy");
}
const fs = require("fs");
const path = require("path");
const { initAuth, handleAuthRequest } = require("./server/auth");

const PORT = process.env.PORT || 8080;
const OLLAMA_URL = "http://127.0.0.1:11434";
const WEB_ROOT = path.join(__dirname, "main");
const TTS_ROOT = path.join(__dirname, "TTS");

const proxy = httpProxy.createProxyServer({
  target: OLLAMA_URL,
  changeOrigin: true,
});

proxy.on("error", (err, req, res) => {
  console.error(`[ProxyError] ${req.method} ${req.url}`, err.message);
  res.writeHead(502);
  res.end("Bad Gateway");
});

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
};

const STATIC_CACHE_MAX_AGE = {
  ".csv": 3600,
  ".html": 300,
};

function getCacheControl(ext) {
  if (ext in STATIC_CACHE_MAX_AGE) {
    return `public, max-age=${STATIC_CACHE_MAX_AGE[ext]}`;
  }
  if (ext && ext !== ".html") {
    return "public, max-age=86400";
  }
  return null;
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function isPathInsideRoot(rootPath, targetPath) {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

const server = http.createServer((req, res) => {
  const rawPath = (req.url || "/").split("?")[0] || "/";
  const requestPath = decodePathname(rawPath);

  if (requestPath.startsWith("/auth/")) {
    handleAuthRequest(req, res, requestPath);
    return;
  }

  if (requestPath.startsWith("/api/")) {
    console.log(`[Proxy] ${req.method} ${requestPath} -> ${OLLAMA_URL}${requestPath}`);
    proxy.web(req, res, { target: OLLAMA_URL });
    return;
  }

  const isTtsRequest = requestPath.startsWith("/tts/");
  const baseRoot = isTtsRequest ? TTS_ROOT : WEB_ROOT;
  const relativePath = isTtsRequest
    ? requestPath.replace(/^\/tts\//, "")
    : requestPath === "/"
      ? "index.html"
      : requestPath.replace(/^\/+/, "");
  const filePath = path.join(baseRoot, relativePath);

  if (!isPathInsideRoot(baseRoot, filePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("Not Found");
      } else {
        res.writeHead(500);
        res.end("Server Error");
      }
      return;
    }

    const headers = { "Content-Type": contentType };
    const cacheControl = getCacheControl(ext);
    if (cacheControl) {
      headers["Cache-Control"] = cacheControl;
    }
    res.writeHead(200, headers);
    res.end(content);
  });
});

server.listen(PORT, () => {
  initAuth();
  console.log("Duolinsheng ————  A lightweight local server for learn dialects");
  console.log("========================================");
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
  console.log(`Web root: ${WEB_ROOT}`);
  console.log(`TTS root: ${TTS_ROOT}`);
  console.log(`Proxying /api/* to ${OLLAMA_URL}`);
  console.log(`Auth API: /auth/register, /auth/login, /auth/me, /auth/data`);
});
