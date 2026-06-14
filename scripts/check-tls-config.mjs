#!/usr/bin/env node
import { request } from "node:https";
import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const host = process.argv[2] || process.env.TLS_CHECK_HOST;
const certPath = process.env.SSL_CERT_PATH;
const MIN_CERT_DAYS = Number(process.env.MIN_CERT_DAYS || 30);

function daysUntil(dateText) {
  return Math.floor((new Date(dateText).getTime() - Date.now()) / 86400000);
}

function checkLocalCert() {
  if (!certPath || !existsSync(certPath)) return null;

  const cert = new X509Certificate(readFileSync(certPath));
  const keyType = cert.publicKey.asymmetricKeyType;
  const details = cert.publicKey.asymmetricKeyDetails || {};
  const keySize = details.modulusLength || details.namedCurve || "unknown";
  const strong =
    (keyType === "rsa" && Number(details.modulusLength || 0) >= 2048) ||
    keyType === "ec" ||
    keyType === "ed25519";

  return {
    subject: cert.subject,
    issuer: cert.issuer,
    validTo: cert.validTo,
    daysRemaining: daysUntil(cert.validTo),
    keyType,
    keySize,
    strong,
    expiresSoon: daysUntil(cert.validTo) < MIN_CERT_DAYS,
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
        rejectUnauthorized: true,
      },
      (res) => {
        const cert = res.socket.getPeerCertificate();
        resolve({
          statusCode: res.statusCode,
          tlsProtocol: res.socket.getProtocol(),
          cipher: res.socket.getCipher(),
          certificate: cert
            ? {
                subject: cert.subject,
                issuer: cert.issuer,
                valid_to: cert.valid_to,
                daysRemaining: daysUntil(cert.valid_to),
              }
            : null,
          headers: {
            hsts: res.headers["strict-transport-security"] || "",
            csp: res.headers["content-security-policy"] || "",
            xContentTypeOptions: res.headers["x-content-type-options"] || "",
            xFrameOptions: res.headers["x-frame-options"] || "",
          },
          sslLabs: `https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(hostname)}`,
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
  if (!localCert.strong || localCert.expiresSoon) {
    process.exitCode = 1;
  }
}

if (host) {
  const remote = await checkRemote(host);
  console.log("Remote HTTPS status:");
  console.log(JSON.stringify(remote, null, 2));

  const headers = remote.headers;
  const headerOk =
    /^max-age=(1[5-9]\d{6,}|[2-9]\d{6,})/i.test(headers.hsts) &&
    headers.hsts.includes("includeSubDomains") &&
    headers.csp &&
    headers.xContentTypeOptions.toLowerCase() === "nosniff" &&
    headers.xFrameOptions.toUpperCase() === "DENY";

  if (!headerOk || !remote.tlsProtocol || remote.tlsProtocol === "TLSv1" || remote.tlsProtocol === "TLSv1.1") {
    process.exitCode = 1;
  }
} else if (!localCert) {
  console.log("Usage: node scripts/check-tls-config.mjs <host>");
  console.log("Optional local cert check: set SSL_CERT_PATH=/path/fullchain.pem");
}
