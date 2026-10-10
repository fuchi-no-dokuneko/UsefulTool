const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const PDFLib = require("../../vendor/pdf-lib.min.js");
const context = { PDFLib, UsefulToolCompression: {}, window: {}, Uint8Array };
vm.runInNewContext(
  fs.readFileSync(
    require.resolve("../../assets/pages/pdf-compression.js"),
    "utf8",
  ),
  context,
  {
    filename: require("node:path").resolve(
      __dirname,
      "../../assets/pages/pdf-compression.js",
    ),
  },
);
const { rawPixels } = context.window.UsefulToolPdfCompression;
function stream(bytes, predictor = 1, extra = {}) {
  return PDFLib.PDFContext.create().flateStream(new Uint8Array(bytes), {
    BitsPerComponent: 8,
    DecodeParms: { Predictor: predictor, Columns: 2, Colors: 1 },
    ...extra,
  });
}
test("PDF PNG scanlines restore all five row filters and the previous row", () => {
  // Every case encodes the same two grayscale scanlines: [10,20], [30,50].
  for (const [mode, bytes] of [
    [0, [0, 10, 20, 0, 30, 50]],
    [1, [1, 10, 10, 1, 30, 20]],
    [2, [2, 10, 20, 2, 20, 30]],
    [3, [3, 10, 15, 3, 25, 25]],
    [4, [4, 10, 10, 4, 20, 20]],
  ])
    assert.deepEqual(
      Array.from(rawPixels(stream(bytes, 15), 2, 2, 1)),
      [10, 20, 30, 50],
      "PNG filter " + mode,
    );
});
test("PDF TIFF predictor restores independent rows without changing channels", () => {
  assert.deepEqual(
    Array.from(rawPixels(stream([10, 10, 30, 20], 2), 2, 2, 1)),
    [10, 20, 30, 50],
  );
});
test("unsupported and truncated image representations are rejected rather than rewritten", () => {
  assert.throws(() => rawPixels(stream([1], 1), 2, 2, 1), /byte count/);
  assert.throws(
    () => rawPixels(stream([1, 2], 1, { BitsPerComponent: 4 }), 2, 1, 1),
    /bit depth/,
  );
  assert.throws(() => rawPixels(stream([0, 1], 15), 2, 1, 1), /predictor/);
  assert.throws(() => rawPixels(stream([5, 1, 2], 15), 2, 1, 1), /filter/);
  assert.throws(() => rawPixels(stream([1, 2], 3), 2, 1, 1), /predictor/);
});
