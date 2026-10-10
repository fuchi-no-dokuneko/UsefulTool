const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  ZipWriter,
  createTarget,
} = require("../../assets/pages/video-studio/archive.js");

test("ZIP streams 1060 ordered entries with independently verified CRCs and bytes", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "utv-archive-"));
  const target = await createTarget(),
    zip = new ZipWriter(target);
  try {
    for (let n = 1; n <= 1060; n++)
      await zip.add(
        "movie-segment-" + String(n).padStart(4, "0") + ".webm",
        new Blob(["segment " + n]),
      );
    const summary = await zip.finish(),
      { blob } = await target.result();
    assert.equal(summary.count, 1060);
    assert.equal(summary.size, blob.size);
    const file = path.join(directory, "movie-segments.zip");
    fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    assert.match(
      execFileSync("unzip", ["-t", file], { encoding: "utf8" }),
      /No errors detected/,
    );
    const names = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" })
      .trim()
      .split("\n");
    assert.equal(names.length, 1060);
    assert.equal(names[0], "movie-segment-0001.webm");
    assert.equal(names.at(-1), "movie-segment-1060.webm");
    assert.deepEqual(names, [...names].sort());
    assert.equal(
      execFileSync("unzip", ["-p", file, names.at(-1)], { encoding: "utf8" }),
      "segment 1060",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ZIP64 supports more than 65535 entries and valid UTF-8 filenames", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "utv-zip64-"));
  const target = await createTarget(),
    zip = new ZipWriter(target);
  try {
    for (let n = 0; n < 65536; n++)
      await zip.add("段落-" + n + ".webm", new Blob([]));
    await zip.finish();
    const { blob } = await target.result(),
      file = path.join(directory, "many.zip");
    fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    const list = execFileSync("unzip", ["-Z1", file], {
      encoding: "utf8",
      maxBuffer: 4e6,
    })
      .trim()
      .split("\n");
    assert.equal(list.length, 65536);
    assert.equal(list[0], "段落-0.webm");
    assert.match(list.at(-1), /65535.webm$/);
    assert.match(
      execFileSync("unzip", ["-tqq", file], { encoding: "utf8" }),
      /^$/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ZIP64 offsets beyond 4 GiB are readable without allocating a huge file", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "utv-zip64-offset-"));
  const file = path.join(directory, "sparse.zip"),
    fd = fs.openSync(file, "w");
  let offset = 0x100000010,
    closed = false;
  try {
    fs.ftruncateSync(fd, offset); // A sparse prefix exercises real 64-bit seeks.
    const zip = new ZipWriter({
      write: async (bytes) => {
        fs.writeSync(fd, bytes, 0, bytes.length, offset);
        offset += bytes.length;
      },
      close: async () => {
        fs.closeSync(fd);
        closed = true;
      },
      abort: async () => {},
    });
    zip.offset = offset;
    await zip.add("beyond-4GiB.webm", new Blob(["Valid ZIP64 offset"]));
    await zip.finish();
    assert.equal(
      execFileSync("unzip", ["-p", file, "beyond-4GiB.webm"], {
        encoding: "utf8",
      }),
      "Valid ZIP64 offset",
    );
    assert.equal(
      execFileSync("unzip", ["-tqq", file], { encoding: "utf8" }),
      "",
    );
    assert.ok(fs.statSync(file).blocks * 512 < 1024 * 1024);
  } finally {
    if (!closed) fs.closeSync(fd);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ZIP cancellation and sink failures stop writes without finalizing an incomplete archive", async () => {
  let writes = 0,
    closed = false,
    aborted = false;
  const controller = new AbortController();
  const sink = {
    write: async () => {
      if (++writes === 2) controller.abort();
    },
    close: async () => {
      closed = true;
    },
    abort: async () => {
      aborted = true;
    },
  };
  const zip = new ZipWriter(sink, controller.signal);
  await assert.rejects(
    zip.add("cancel.webm", new Blob([new Uint8Array(250000)])),
    { name: "AbortError" },
  );
  await zip.abort();
  assert.equal(writes, 2);
  assert.equal(closed, false);
  assert.equal(aborted, true);
  const failed = new ZipWriter({
    ...sink,
    write: async () => {
      throw new Error("Disk full");
    },
  });
  await assert.rejects(failed.add("failed.webm", new Blob(["x"])), /Disk full/);
  assert.equal(failed.entries.length, 0);
});
