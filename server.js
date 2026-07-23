const http = require("http");
const https = require("https");
const crypto = require("crypto");
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
const { handleMcpRequest } = require("./server/mcp");

const PORT = process.env.PORT || 8080;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const OLLAMA_URL = "http://127.0.0.1:11434";
const WEB_ROOT = path.join(__dirname, "main");
const TTS_ROOT = path.join(__dirname, "TTS");
const FORCE_HTTPS = process.env.FORCE_HTTPS === "1";
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || "";
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || "";
const LOG_DIR = path.join(__dirname, "logs");
const REQUEST_LOG_FILE = path.join(LOG_DIR, "run_log.jsonl");

const proxy = httpProxy.createProxyServer({
  target: OLLAMA_URL,
  changeOrigin: true,
});

proxy.on("error", (err, req, res) => {
  console.error(`[ProxyError] ${req.method} ${req.url}`, err.message);
  writeHeadWithSecurity(req, res, 502);
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

function isSecureRequest(req) {
  return Boolean(req.socket.encrypted) || String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";
}

function buildSecurityHeaders(req) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "media-src 'self' blob:",
      "connect-src 'self' http://127.0.0.1:* http://localhost:* https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  };
  if (isSecureRequest(req)) {
    headers["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains";
  }
  return headers;
}

function writeHeadWithSecurity(req, res, status, headers = {}) {
  res.writeHead(status, { ...buildSecurityHeaders(req), ...headers });
}

function sendPlain(req, res, status, text, extraHeaders = {}) {
  writeHeadWithSecurity(req, res, status, {
    "Content-Type": "text/plain; charset=utf-8",
    ...extraHeaders,
  });
  res.end(text);
}

function redirectToHttps(req, res) {
  const host = String(req.headers.host || `127.0.0.1:${PORT}`).replace(/:\d+$/, `:${HTTPS_PORT}`);
  res.writeHead(301, {
    Location: `https://${host}${req.url || "/"}`,
  });
  res.end();
}

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

function logRequest(entry) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(REQUEST_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    // 日志不可用不能影响主服务；只输出最小错误信息，避免泄露请求内容。
    console.error("[RequestLogError]", error.message);
  }
}

function observeRequest(req, res) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const requestPath = decodePathname(((req.url || "/").split("?")[0] || "/")).slice(0, 240);
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  res.once("finish", () => {
    const status = res.statusCode || 500;
    logRequest({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      method: req.method || "GET",
      path: requestPath,
      status,
      latency_ms: Date.now() - startedAt,
      error_code: status >= 500 ? "server_error" : status >= 400 ? `http_${status}` : null,
    });
  });
}

function handleRequest(req, res) {
  observeRequest(req, res);
  if (FORCE_HTTPS && !isSecureRequest(req)) {
    redirectToHttps(req, res);
    return;
  }

  const originalWriteHead = res.writeHead;
  res.writeHead = function writeHeadWithDefaultSecurity(statusCode, reasonPhrase, headers) {
    const securityHeaders = buildSecurityHeaders(req);
    if (typeof reasonPhrase === "string") {
      return originalWriteHead.call(this, statusCode, reasonPhrase, {
        ...securityHeaders,
        ...(headers || {}),
      });
    }
    return originalWriteHead.call(this, statusCode, {
      ...securityHeaders,
      ...(reasonPhrase || {}),
    });
  };

  const rawPath = (req.url || "/").split("?")[0] || "/";
  const requestPath = decodePathname(rawPath);

  if (requestPath.startsWith("/auth/")) {
    handleAuthRequest(req, res, requestPath);
    return;
  }

  if (requestPath === "/mcp" || requestPath.startsWith("/mcp/")) {
    handleMcpRequest(req, res, requestPath);
    return;
  }

  if (requestPath === "/health/security") {
    sendPlain(
      req,
      res,
      200,
      JSON.stringify({
        httpsEnabled: isSecureRequest(req),
        forceHttps: FORCE_HTTPS,
        hsts: isSecureRequest(req),
        tls: "TLS 1.2/1.3 when SSL_CERT_PATH and SSL_KEY_PATH are configured",
      }),
      { "Content-Type": "application/json; charset=utf-8" },
    );
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
    sendPlain(req, res, 403, "Forbidden");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        sendPlain(req, res, 404, "Not Found");
      } else {
        sendPlain(req, res, 500, "Server Error");
      }
      return;
    }

    const headers = { "Content-Type": contentType };
    const cacheControl = getCacheControl(ext);
    if (cacheControl) {
      headers["Cache-Control"] = cacheControl;
    }
    writeHeadWithSecurity(req, res, 200, headers);
    res.end(content);
  });
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  initAuth();
  console.log("Duolinsheng ————  A lightweight local server for learn dialects");
  console.log("========================================");
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
  console.log(`Web root: ${WEB_ROOT}`);
  console.log(`TTS root: ${TTS_ROOT}`);
  console.log(`Proxying /api/* to ${OLLAMA_URL}`);
  console.log(`Auth API: /auth/register, /auth/login, /auth/me, /auth/data`);
  console.log("MCP API: /mcp, /mcp/tools, /mcp/call, /mcp/guardrail/check, /mcp/feedback, /mcp/memory/*");
  console.log(
    `Guardrail: AI judge+rewrite ${process.env.GUARDRAIL_AI_ENABLED === "0" ? "disabled" : "enabled"} (model: ${process.env.GUARDRAIL_MODEL || "qwen2.5:1.5b"})`,
  );
});

if (SSL_CERT_PATH && SSL_KEY_PATH) {
  const httpsServer = https.createServer(
    {
      cert: fs.readFileSync(SSL_CERT_PATH),
      key: fs.readFileSync(SSL_KEY_PATH),
      minVersion: "TLSv1.2",
      ciphers: [
        "TLS_AES_256_GCM_SHA384",
        "TLS_CHACHA20_POLY1305_SHA256",
        "TLS_AES_128_GCM_SHA256",
        "ECDHE-ECDSA-AES256-GCM-SHA384",
        "ECDHE-RSA-AES256-GCM-SHA384",
        "ECDHE-ECDSA-CHACHA20-POLY1305",
        "ECDHE-RSA-CHACHA20-POLY1305",
        "ECDHE-ECDSA-AES128-GCM-SHA256",
        "ECDHE-RSA-AES128-GCM-SHA256",
      ].join(":"),
      honorCipherOrder: false,
    },
    handleRequest,
  );

  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`HTTPS server running at https://127.0.0.1:${HTTPS_PORT}/`);
  });
} else {
  console.log("HTTPS disabled: set SSL_CERT_PATH and SSL_KEY_PATH to enable TLS 1.2/1.3 locally.");
}
