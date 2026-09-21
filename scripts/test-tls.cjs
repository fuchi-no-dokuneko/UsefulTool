// Local acceptance servers use a repository-local, self-signed certificate.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
module.exports = function testTls(root) {
  const directory = path.join(root, "build", "test-tls");
  const key = path.join(directory, "key.pem");
  const cert = path.join(directory, "cert.pem");
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", key, "-out", cert, "-days", "365", "-subj", "/CN=127.0.0.1",
      "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
    fs.chmodSync(key, 0o600);
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
};
