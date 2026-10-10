// Reproducibly bundle the exact dependency versions in tests/video-studio/package-lock.json.
import { build } from "../tests/video-studio/node_modules/esbuild/lib/main.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "assets/pages/video-studio/vendor");
await fs.mkdir(output, { recursive: true });
const licenses = await Promise.all(
  ["mediabunny", "soundtouchjs"].map(
    async (name) =>
      name +
      "\n\n" +
      (await fs.readFile(
        path.join(root, "tests/video-studio/node_modules", name, "LICENSE"),
        "utf8",
      )),
  ),
);
await build({
  entryPoints: [path.join(root, "tests/video-studio/codecs.entry.mjs")],
  outfile: path.join(output, "codecs.js"),
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "UTVideoCodecs",
  target: "es2022",
  legalComments: "inline",
  banner: {
    js:
      "/*! Local media libraries and corresponding source:\n" +
      "Mediabunny 1.56.2: https://registry.npmjs.org/mediabunny/-/mediabunny-1.56.2.tgz\n" +
      "SoundTouchJS 0.3.0: https://registry.npmjs.org/soundtouchjs/-/soundtouchjs-0.3.0.tgz\n" +
      "Unmodified library source is bundled with tests/video-studio/codecs.entry.mjs.\n\n" +
      licenses.join("\n\n") +
      "\n*/",
  },
});
await fs.writeFile(path.join(output, "LICENSES.txt"), licenses.join("\n\n"));
console.log(
  "Built local Video Studio codecs (" +
    (await fs.stat(path.join(output, "codecs.js"))).size +
    " bytes).",
);
