import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = (await fs.readdir(root)).filter((name) => name.endsWith(".html")).sort();
const failures = [];
const maximumArtifactBytes = 2 * 1024 * 1024;
const manifest = JSON.parse(await fs.readFile(path.join(root, "offline", "manifest.json"), "utf8"));
const manifestEntries = new Map(manifest.pages.map((entry) => [entry.file, entry]));

for (const name of pages) {
  const source = await fs.readFile(path.join(root, name), "utf8");
  const expectedLink = `href="offline/${name}"`;
  if (!source.includes(expectedLink) || !source.match(new RegExp(`${expectedLink}[^>]*\\bdownload\\b`))) {
    failures.push(`${name}: missing downloadable offline link`);
  }

  const offlinePath = path.join(root, "offline", name);
  let offline;
  try { offline = await fs.readFile(offlinePath, "utf8"); }
  catch (error) { failures.push(`${name}: offline copy is missing`); continue; }
  if (/<link\s+[^>]*href="(?!data:|https?:|\/\/)/i.test(offline)) failures.push(`${name}: offline copy has a local stylesheet dependency`);
  if (/<script\s+[^>]*src="(?!data:|https?:|\/\/)/i.test(offline)) failures.push(`${name}: offline copy has a local script dependency`);
  for (const script of offline.matchAll(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (/from\s+["']\.\.?\//.test(script[1])) failures.push(`${name}: offline copy has a local module dependency`);
  }
  if (!/connect-src\s+'none'/i.test(offline)) failures.push(`${name}: offline copy does not block outbound connections`);
  const applicationSource = offline.replace(/<script[^>]*data-inlined-from="vendor\/[^"]+"[^>]*>[\s\S]*?<\/script>/gi, "");
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(applicationSource)) failures.push(`${name}: offline copy contains a network API call outside a vendored library`);
  if (Buffer.byteLength(offline) > maximumArtifactBytes) failures.push(`${name}: offline copy exceeds the 2 MiB budget`);
  const entry = manifestEntries.get(name);
  const digest = crypto.createHash("sha256").update(offline).digest("hex");
  if (!entry || entry.bytes !== Buffer.byteLength(offline) || entry.sha256 !== digest) failures.push(`${name}: manifest checksum or size does not match`);
}

if (manifest.schema !== "usefultool-offline.v1" || manifest.pages.length !== pages.length) {
  failures.push("offline/manifest.json does not describe every generated page");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Verified ${pages.length} self-contained offline pages.`);
