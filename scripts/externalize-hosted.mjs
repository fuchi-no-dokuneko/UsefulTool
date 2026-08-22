import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "assets", "pages");
const pages = (await fs.readdir(root)).filter((name) => name.endsWith(".html")).sort();

function deindent(source) {
  const lines = source.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indentation = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length));
  return `${lines.map((line) => line.slice(indentation)).join("\n")}\n`;
}

await fs.mkdir(output, { recursive: true });
let extracted = 0;
for (const name of pages) {
  const file = path.join(root, name);
  let html = await fs.readFile(file, "utf8");
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]));
  if (scripts.length > 1) throw new Error(`${name} contains more than one inline executable script`);
  if (scripts.length === 1) {
    const [tag, attributes, source] = scripts[0];
    const scriptName = `${path.basename(name, ".html")}.js`;
    const javascript = deindent(source).replace(/(from\s+["'])\.\/vendor\//g, "$1../../vendor/");
    await fs.writeFile(path.join(output, scriptName), javascript);
    html = html.replace(tag, `<script${attributes} src="assets/pages/${scriptName}"></script>`);
    extracted += 1;
  }
  html = html.replaceAll("script-src 'self' 'unsafe-inline'", "script-src 'self'");
  await fs.writeFile(file, html);
}

const headers = path.join(root, "_headers");
const headerSource = await fs.readFile(headers, "utf8");
await fs.writeFile(headers, headerSource.replaceAll("script-src 'self' 'unsafe-inline'", "script-src 'self'"));
console.log(`Externalized ${extracted} hosted page script(s).`);
