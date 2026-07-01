import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = (await fs.readdir(root)).filter((name) => name.endsWith(".html")).sort();
const failures = [];

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
  if (/from\s+["']\.\.?\//.test(offline)) failures.push(`${name}: offline copy has a local module dependency`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Verified ${pages.length} self-contained offline pages.`);
