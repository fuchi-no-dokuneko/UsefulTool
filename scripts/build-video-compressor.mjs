// Separate conversion bundle; Video Studio's runtime and controls stay unchanged.
import { build } from "../tests/video-studio/node_modules/esbuild/lib/main.js";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const license = await fs.readFile(
  root + "tests/video-studio/node_modules/mediabunny/LICENSE",
  "utf8",
);
await build({
  entryPoints: [root + "tests/new-tools/video-codecs.entry.mjs"],
  outfile: root + "vendor/video-compress.min.js",
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "UTVideoCompress",
  target: "es2022",
  legalComments: "inline",
  banner: {
    js:
      "/*! Mediabunny 1.56.2 — local conversion bundle.\nSource: https://registry.npmjs.org/mediabunny/-/mediabunny-1.56.2.tgz\n" +
      license +
      "\n*/",
  },
});
await fs.writeFile(root + "vendor/LICENSE-video-compress.txt", license);
console.log(
  "Built video compressor:",
  (await fs.stat(root + "vendor/video-compress.min.js")).size,
  "bytes",
);
