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
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(script[1])?.[1].toLowerCase();
    const dataBlock = ["text/plain", "application/json"].includes(type);
    if (!dataBlock && !/\bsrc\s*=/.test(script[1])) failures.push(`${name}: executable JavaScript is inline`);
  }
  if (/\son[a-z]+\s*=/i.test(html)) failures.push(`${name}: inline event handler found`);
  if (/script-src[^;]*unsafe-inline/i.test(html)) failures.push(`${name}: script-src allows unsafe-inline`);
  if (/https?:\/\//i.test(html)) failures.push(`${name}: external runtime URL found`);
}

const headers = await fs.readFile(path.join(root, "_headers"), "utf8");
if (/script-src[^;]*unsafe-inline/i.test(headers)) failures.push("_headers: script-src allows unsafe-inline");
if (!headers.includes("connect-src 'none'")) failures.push("_headers: outbound connections are not disabled");
if (/\/assets\/\*[^\S\r\n]*\r?\n[ \t]+Cache-Control:[^\r\n]*immutable/i.test(headers)) failures.push("_headers: mutable application assets use immutable caching");
if (!/\/assets\/\*\s+Cache-Control:\s*public, max-age=0, must-revalidate/i.test(headers)) failures.push("_headers: application assets must revalidate");

const videoEditorHtml = await fs.readFile(path.join(root, "video-editor.html"), "utf8");
if (!/assets\/pages\/video-editor\.js\?v=[^"']+/.test(videoEditorHtml)) failures.push("video-editor.html: editor script is not cache-busted");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Verified ${pages.length} strict hosted pages.`);
