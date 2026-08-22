import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = (await fs.readdir(root)).filter((name) => name.endsWith(".html")).sort();
const failures = [];

for (const name of pages) {
  const html = await fs.readFile(path.join(root, name), "utf8");
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  for (const script of scripts) {
    if (!/\bsrc\s*=/.test(script[1])) failures.push(`${name}: executable JavaScript is inline`);
  }
  if (/\son[a-z]+\s*=/i.test(html)) failures.push(`${name}: inline event handler found`);
  if (/script-src[^;]*unsafe-inline/i.test(html)) failures.push(`${name}: script-src allows unsafe-inline`);
  if (/https?:\/\//i.test(html)) failures.push(`${name}: external runtime URL found`);
}

const headers = await fs.readFile(path.join(root, "_headers"), "utf8");
if (/script-src[^;]*unsafe-inline/i.test(headers)) failures.push("_headers: script-src allows unsafe-inline");
if (!headers.includes("connect-src 'none'")) failures.push("_headers: outbound connections are not disabled");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Verified ${pages.length} strict hosted pages.`);
