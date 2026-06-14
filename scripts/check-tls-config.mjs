#!/usr/bin/env node
import { request } from "node:https";
import { X509Certificate } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const host = process.argv[2] || process.env.TLS_CHECK_HOST;
const certPath = process.env.SSL_CERT_PATH;

function checkLocalCert() {
  if (!certPath || !existsSync(certPath)) return null;
  const cert = new X509Certificate(readFileSync(certPath));
  const keyType = cert.publicKey.asymmetricKeyType;
  const details = cert.publicKey.asymmetricKeyDetails || {};
  const strong =
    (keyType === "rsa" && Number(details.modulusLength || 0) >= 2048) ||
    keyType === "ec" ||
    keyType === "ed25519";
  return {
    subject: cert.subject,
    validTo: cert.validTo,
    keyType,
    keySize: details.modulusLength || details.namedCurve || "unknown",
    strong,
  };
}

function checkRemote(hostname) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: hostname,
        port: 443,
        method: "HEAD",
        servername: hostname,
        minVersion: "TLSv1.2",
      },
      (res) => {
        resolve({
          statusCode: res.statusCode,
          hsts: res.headers["strict-transport-security"] || "",
          csp: res.headers["content-security-policy"] || "",
          xContentTypeOptions: res.headers["x-content-type-options"] || "",
          xFrameOptions: res.headers["x-frame-options"] || "",
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const localCert = checkLocalCert();
if (localCert) {
  console.log("Local certificate:");
  console.log(JSON.stringify(localCert, null, 2));
}

if (host) {
  const remote = await checkRemote(host);
  console.log("Remote HTTPS headers:");
  console.log(JSON.stringify(remote, null, 2));
  console.log(`SSL Labs: https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(host)}`);
} else if (!localCert) {
  console.log("Usage: node scripts/check-tls-config.mjs <host>");
  console.log("Optional local cert check: set SSL_CERT_PATH=/path/fullchain.pem");
}
