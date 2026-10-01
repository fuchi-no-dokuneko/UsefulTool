const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function canvasHarness(userAgent) {
  const created = [];
  const context = {
    navigator: { userAgent },
    UTStudio: { Model: {} },
    document: {
      createElement() {
        // Like a browser, the first context request fixes its attributes.
        let attributes;
        const canvas = {
          getContext(type, options) {
            attributes ??= { willReadFrequently: false, ...options };
            return { getContextAttributes: () => attributes };
          },
        };
        created.push(canvas);
        return canvas;
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.resolve(__dirname, "../../assets/pages/video-studio/media.js"),
      "utf8",
    ),
    context,
  );
  return { media: context.UTStudio.Media, created };
}

test("Linux Firefox selects software backing before a canvas is first drawn", () => {
  const { media } = canvasHarness(
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0",
  );
  const canvas = media.makeCanvas(704, 1280);
  assert.equal(canvas.width, 704);
  assert.equal(canvas.height, 1280);
  assert.equal(
    canvas.getContext("2d").getContextAttributes().willReadFrequently,
    true,
  );
  canvas.width = 352;
  assert.equal(
    canvas.getContext("2d").getContextAttributes().willReadFrequently,
    true,
  );
  const output = canvasHarness("").media.makeCanvas(704, 1280);
  assert.equal(media.prepareCanvas(output), output);
  assert.equal(
    output.getContext("2d").getContextAttributes().willReadFrequently,
    true,
  );
});

test("canvas compatibility leaves other browsers and explicit readback choices unchanged", () => {
  for (const userAgent of [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X; rv:153.0) Gecko/20100101 Firefox/153.0",
    "Mozilla/5.0 (Android 15; Mobile; rv:153.0) Gecko/153.0 Firefox/153.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    "",
  ]) {
    const { media } = canvasHarness(userAgent);
    assert.equal(
      media.makeCanvas(100, 100).getContext("2d").getContextAttributes()
        .willReadFrequently,
      false,
    );
    assert.equal(
      media
        .makeCanvas(100, 100)
        .getContext("2d", { willReadFrequently: true })
        .getContextAttributes().willReadFrequently,
      true,
    );
  }
});

function harness({ snapshots = true, bitmaps = true } = {}) {
  const pending = [],
    frames = [],
    callbacks = new Map(),
    timers = new Map();
  let callbackId = 0;
  let timerId = 0;
  class Element extends EventTarget {
    constructor() {
      super();
      this.readyState = 4;
      this.currentTime = 9;
      this.presented = 8.966667;
      this.paused = true;
    }
    pause() {
      this.paused = true;
    }
    load() {}
    removeAttribute() {}
    requestVideoFrameCallback(fn) {
      callbacks.set(++callbackId, fn);
      return callbackId;
    }
    cancelVideoFrameCallback(id) {
      callbacks.delete(id);
    }
  }
  const context = {
    UTStudio: { Model: {} },
    DOMException,
    Event,
    URL,
    setTimeout(fn) {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    document: { createElement: () => new Element() },
    createImageBitmap: bitmaps
      ? (source, options) =>
          new Promise((resolve, reject) =>
            pending.push({ source, options, resolve, reject }),
          )
      : undefined,
    VideoFrame: snapshots
      ? class {
          constructor(element) {
            if (element.snapshotError) throw element.snapshotError;
            if (element.invalidSnapshot)
              throw new DOMException("Decoder handoff", "InvalidStateError");
            this.timestamp = element.presented * 1e6;
            this.closed = false;
            frames.push(this);
          }
          close() {
            this.closed = true;
          }
        }
      : undefined,
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.resolve(__dirname, "../../assets/pages/video-studio/media.js"),
      "utf8",
    ),
    context,
  );
  const library = new context.UTStudio.Media.MediaLibrary(),
    item = { id: "picture", kind: "video", assetId: "source" };
  library.assets.set("source", { url: "blob:test" });
  const element = library.element(item);
  const drain = async () => {
    for (let n = 0; n < 12; n++) await Promise.resolve();
  };
  function complete(index = 0) {
    const bitmap = {
      closed: false,
      close() {
        this.closed = true;
      },
    };
    pending[index].resolve(bitmap);
    return bitmap;
  }
  return {
    library,
    item,
    element,
    pending,
    frames,
    callbacks,
    drain,
    complete,
    expire() {
      for (const fn of [...timers.values()]) fn();
    },
  };
}

test("decoded video remains drawable while the first bitmap is still pending", async () => {
  const h = harness(),
    preparing = h.library.captureFrame(h.item);
  await h.drain();
  assert.equal(h.library.frameFor(h.item), h.element);
  assert.equal(h.library.frameTimestamp(h.item), null);
  h.complete();
  await preparing;
  h.library.dispose();
});

test("a stalled bitmap cannot block seeking or playback and late pixels are released", async () => {
  const h = harness(),
    preparing = h.library.captureFrame(h.item);
  await h.drain();
  let finished = false;
  preparing.then(() => {
    finished = true;
  });
  h.expire();
  await h.drain();
  assert.equal(finished, true, "frame preparation has a bounded wait");
  assert.equal(h.frames[0].closed, true, "release the stalled GPU snapshot");
  assert.equal(h.library.frameFor(h.item), h.element);
  assert.equal(h.library.frames.get(h.item.id).pending, null);
  await h.library.captureFrame(h.item);
  assert.equal(
    h.pending.length,
    1,
    "do not queue more work on a stalled converter",
  );
  const late = h.complete();
  await h.drain();
  assert.equal(late.closed, true);
  assert.equal(h.library.frameFor(h.item), h.element);
  h.library.dispose();
});

test("bitmap conversion failures cannot suppress a successfully decoded video", async () => {
  const h = harness(),
    preparing = h.library.captureFrame(h.item);
  await h.drain();
  h.pending[0].reject(new DOMException("Surface copy failed", "UnknownError"));
  await preparing;
  assert.equal(h.library.frameFor(h.item), h.element);
  assert.equal(h.frames[0].closed, true);
  h.library.dispose();
});

test("a VideoFrame surface failure falls back to the decoded video", async () => {
  const h = harness();
  h.element.snapshotError = new DOMException(
    "Surface copy failed",
    "UnknownError",
  );
  const preparing = h.library.captureFrame(h.item);
  await h.drain();
  assert.equal(h.pending[0].source, h.element);
  const bitmap = h.complete();
  await preparing;
  assert.equal(h.library.frameFor(h.item), bitmap);
  h.element.paused = false;
  h.element.currentTime += 1;
  assert.equal(
    h.library.frameFor(h.item),
    h.element,
    "timestamp sampling cannot break the native fallback",
  );
  await h.drain();
  h.complete(1);
  await h.drain();
  h.library.dispose();
});

test("an obsolete conversion timeout cannot disable a newer seek's bitmap", async () => {
  const h = harness(),
    old = h.library.captureFrame(h.item);
  await h.drain();
  h.element.presented = 20;
  const latest = h.library.captureFrame(h.item);
  await h.drain();
  const current = h.complete(1);
  await latest;
  h.expire();
  await h.drain();
  assert.equal(h.library.frameFor(h.item), current);
  const late = h.complete(0);
  await old;
  assert.equal(late.closed, true);
  h.library.dispose();
});

test("prepared preview pixels retain the decoded frame time, independent of the media clock", async () => {
  const h = harness(),
    prepared = h.library.captureFrame(h.item);
  await h.drain();
  const bitmap = h.complete();
  await prepared;
  assert.equal(h.library.frameFor(h.item), bitmap);
  assert.equal(h.library.frameTimestamp(h.item), h.element.presented);
  assert.notEqual(h.library.frameTimestamp(h.item), h.element.currentTime);
  assert.equal(h.frames[0].closed, true);
  await h.library.captureFrame(h.item, null, undefined, false);
  assert.equal(
    h.pending.length,
    1,
    "the same decoded frame does not allocate another bitmap",
  );
  h.library.dispose();
  assert.equal(bitmap.closed, true);
  assert.equal(h.callbacks.size, 0);
});

test("a transient VideoFrame handoff cannot break project recovery or disable future snapshots", async () => {
  const h = harness();
  h.element.invalidSnapshot = true;
  const preparing = h.library.captureFrame(h.item);
  await h.drain();
  assert.equal(h.pending[0].source, h.element);
  const bitmap = h.complete();
  await preparing;
  assert.equal(h.library.frameFor(h.item), bitmap);
  h.element.invalidSnapshot = false;
  const next = h.library.captureFrame(h.item);
  await h.drain();
  assert.notEqual(h.pending[1].source, h.element);
  h.complete(1);
  await next;
  h.library.dispose();
});

test("an unavailable bitmap falls back to native preview and recovers on the next decoded frame", async () => {
  const h = harness(),
    preparing = h.library.captureFrame(h.item);
  await h.drain();
  h.pending[0].reject(new DOMException("No frame yet", "InvalidStateError"));
  await preparing;
  assert.equal(h.library.frameFor(h.item), h.element);
  await h.drain();
  const bitmap = h.complete(1);
  await h.drain();
  assert.equal(h.library.frameFor(h.item), bitmap);
  h.library.dispose();
});

test("a newer seek wins when an old bitmap finishes after its replacement", async () => {
  const h = harness(),
    old = h.library.captureFrame(h.item);
  h.element.presented = 20;
  const latest = h.library.captureFrame(h.item);
  await h.drain();
  const current = h.complete(1);
  await latest;
  const stale = h.complete(0);
  await old;
  assert.equal(h.library.frameFor(h.item), current);
  assert.equal(h.library.frameTimestamp(h.item), 20);
  assert.equal(stale.closed, true);
  assert.equal(current.closed, false);
  assert.ok(h.frames.every((frame) => frame.closed));
  h.library.dispose();
});

test("cancelling frame preparation releases the caller immediately and discards late pixels", async () => {
  const h = harness(),
    controller = new AbortController();
  const preparing = h.library.captureFrame(h.item, controller.signal);
  await h.drain();
  controller.abort();
  await assert.rejects(preparing, { name: "AbortError" });
  const late = h.complete();
  await h.drain();
  assert.equal(late.closed, true);
  assert.equal(h.library.frameFor(h.item), h.element);
  assert.equal(h.frames[0].closed, true);
  h.library.dispose();
});

test("closing a project releases both completed and in-flight preview frames", async () => {
  const h = harness(),
    preparing = h.library.captureFrame(h.item);
  await h.drain();
  h.library.dispose();
  const late = h.complete();
  await preparing;
  assert.equal(late.closed, true);
  assert.equal(h.frames[0].closed, true);
  assert.equal(h.library.frames.size, 0);
  assert.equal(h.callbacks.size, 0);
});

test("a playing decoder with delayed frame callbacks refreshes its cached pixels", async () => {
  const h = harness(),
    initial = h.library.captureFrame(h.item);
  await h.drain();
  const first = h.complete();
  await initial;
  h.element.paused = false;
  h.element.currentTime = 9.01;
  h.element.presented = 9;
  assert.equal(
    h.library.frameFor(h.item),
    first,
    "drawing never waits for a new bitmap",
  );
  h.library.frameFor(h.item);
  await h.drain();
  assert.equal(h.pending.length, 2, "only one asynchronous refresh can run");
  const next = h.complete(1);
  await h.drain();
  assert.equal(h.library.frameFor(h.item), next);
  assert.equal(first.closed, true);
  assert.equal(h.library.frameTimestamp(h.item), 9);
  h.library.dispose();
});

test("a delayed bitmap conversion cannot leave a visibly stale frame on screen", async () => {
  const h = harness(),
    initial = h.library.captureFrame(h.item);
  await h.drain();
  h.complete();
  await initial;
  h.element.paused = false;
  h.element.currentTime = 9.3;
  h.element.presented = 9.266667;
  assert.equal(h.library.frameFor(h.item), h.element);
  assert.equal(h.library.frameTimestamp(h.item), 9.266667);
  await h.drain();
  h.complete(1);
  await h.drain();
  assert.notEqual(h.library.frameFor(h.item), h.element);
  h.library.dispose();
});

test("browsers without bitmap or VideoFrame support retain a usable preview path", async () => {
  const basic = harness({ bitmaps: false });
  await basic.library.captureFrame(basic.item);
  assert.equal(basic.library.frameFor(basic.item), basic.element);
  basic.library.dispose();
  const h = harness({ snapshots: false }),
    preparing = h.library.captureFrame(h.item, null, 8.95);
  await h.drain();
  assert.equal(h.pending[0].source, h.element);
  h.pending[0].reject(
    new DOMException("Unsupported input", "NotSupportedError"),
  );
  await preparing;
  assert.equal(h.library.frameFor(h.item), h.element);
  h.library.dispose();
});

test("uncropped preview frames have bounded resolution while crop edits retain native pixels", async () => {
  const h = harness();
  h.element.videoWidth = 1280;
  h.element.videoHeight = 720;
  h.item.transform = {
    width: 1280,
    height: 720,
    cropWidth: 1280,
    cropHeight: 720,
  };
  const preparing = h.library.captureFrame(h.item);
  await h.drain();
  assert.equal(h.pending[0].options.resizeWidth, 960);
  assert.equal(h.pending[0].options.resizeHeight, 540);
  const bitmap = h.complete();
  bitmap.width = 960;
  bitmap.height = 540;
  await preparing;
  assert.equal(h.library.frameFor(h.item), bitmap);
  h.item.transform.cropWidth = 320;
  assert.equal(
    h.library.frameFor(h.item),
    h.element,
    "a paused crop immediately gets the original source pixels",
  );
  const cropped = h.library.captureFrame(h.item);
  await h.drain();
  assert.equal(h.pending[1].options.resizeWidth, undefined);
  h.complete(1);
  await cropped;
  h.library.dispose();
});
