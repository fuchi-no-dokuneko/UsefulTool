// npm run test:firefox-ears; downloads Firefox separately into ~/UAT-firefox.
const { launch } = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const reports = path.join(root, "build/reports/video-studio/firefox-ears");
fs.mkdirSync(reports, { recursive: true });
const fixture = path.join(reports, "stereo.mp4"),
  mp3 = path.join(reports, "stereo.mp3");
if (!fs.existsSync(fixture))
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=15:duration=32",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=0.15*sin(2*PI*440*t)|0.15*sin(2*PI*880*t):s=48000:d=32",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    fixture,
  ]);
if (!fs.existsSync(mp3))
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    fixture,
    "-vn",
    "-c:a",
    "libmp3lame",
    mp3,
  ]);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".json": "application/json",
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  )
    return res.writeHead(404).end();
  res.writeHead(200, {
    "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});
const checks = [],
  errors = [],
  owned = new Set();
let browser, page;
function descendants(pid) {
  const processes = execFileSync("ps", ["-eo", "pid=,ppid=,args="], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((s) => {
      const m = s.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      return { pid: +m[1], ppid: +m[2], args: m[3] };
    });
  const ids = new Set([pid]);
  for (let n = 0; n < 5; n++)
    for (const p of processes) if (ids.has(p.ppid)) ids.add(p.pid);
  return processes.filter((p) => ids.has(p.pid));
}
const check = (name, condition, detail) => {
  checks.push({ name, passed: !!condition, detail });
  console.log((condition ? "PASS " : "FAIL ") + name);
  assert.ok(condition, name + (detail ? ": " + JSON.stringify(detail) : ""));
};
const state = () =>
  page.evaluate(() => structuredClone(UsefulToolVideoEditor.project));
const click = async (selector) => {
  await page.locator(selector).click();
};
async function input(selector, value) {
  await click(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.type(String(value));
  await page.keyboard.press("Tab");
}
async function command(key) {
  await page.keyboard.down("Control");
  await page.keyboard.press(key);
  await page.keyboard.up("Control");
  if (["z", "y"].includes(key))
    await page.evaluate(() =>
      UsefulToolVideoEditor.seekTo(UsefulToolVideoEditor.project.playhead),
    );
}
async function ready() {
  await page.waitForFunction(() => window.UsefulToolVideoEditor?.ready);
}
async function select(id) {
  const selector = `.timeline-item[data-item-id="${id}"]`;
  const box = await page.$eval(selector, (e) => {
    e.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = e.getBoundingClientRect(),
      v = document.getElementById("timelineViewport").getBoundingClientRect();
    return {
      x: Math.max(r.left + 30, v.left + 170),
      y: r.top + 18,
      right: Math.min(r.right, v.right),
    };
  });
  await page.mouse.click(Math.min(box.x, box.right - 15), box.y);
}
async function screenshot(name) {
  await page.screenshot({
    path: path.join(reports, name + ".png"),
    fullPage: true,
  });
}
async function layout(label, width, height, scale = 1) {
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.evaluate(() => {
    document.getElementById("contextPanel").classList.remove("is-open");
    document.getElementById("timelineViewport").scrollLeft = 0;
    document.getElementById("timelineViewport").scrollTop = 0;
    document.getElementById("contextPanel").scrollTop = 0;
    UTStudio.Help.close();
  });
  await page.waitForFunction(
    () => document.getElementById("previewCanvas").width > 0,
  );
  await page.mouse.move(1, 1);
  await screenshot(label);
  const result = await page.evaluate(() => {
    const box = (s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const overlaps = [];
    const buttons = [
      ...document.querySelectorAll(
        "#timelineHead button:not(.touch-help),#timelineHead .zoom-label,#timelineHead h2",
      ),
    ].filter((e) => e.getBoundingClientRect().width);
    for (let i = 0; i < buttons.length; i++)
      for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i].getBoundingClientRect(),
          b = buttons[j].getBoundingClientRect();
        if (
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        )
          overlaps.push([buttons[i].textContent, buttons[j].textContent]);
      }
    const escaped = buttons
      .filter((e) => {
        const r = e.getBoundingClientRect(),
          h = document.getElementById("timelineHead").getBoundingClientRect();
        return (
          r.left < h.left - 1 ||
          r.right > h.right + 1 ||
          r.top < h.top - 1 ||
          r.bottom > h.bottom + 1
        );
      })
      .map((e) => e.textContent);
    const labelOverlaps = [];
    const indices = [...document.querySelectorAll(".segment-index > span")].map(
      (e) => e.getBoundingClientRect(),
    );
    for (let i = 1; i < indices.length; i++)
      if (indices[i - 1].right > indices[i].left + 1) labelOverlaps.push(i);
    return {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      pageWidth: document.documentElement.scrollWidth,
      timeline: box(".timeline-card"),
      trackWidth: box(".track-row").width,
      viewportWidth: document.getElementById("timelineViewport").clientWidth,
      context: box("#contextPanel"),
      head: box("#timelineHead"),
      overlaps,
      escaped,
      labelOverlaps,
    };
  });
  check(
    "layout " +
      label +
      " has no toolbar overlap, escape or page-width overflow",
    !result.overlaps.length &&
      !result.escaped.length &&
      result.pageWidth <= width + 1 &&
      result.trackWidth >= result.viewportWidth &&
      !result.labelOverlaps.length,
    result,
  );
  if (width >= 760)
    check(
      "timeline aligns with settings right edge at " + label,
      Math.abs(result.timeline.right - result.context.right) < 1,
      result,
    );
  return result;
}
(async () => {
  try {
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    browser = await launch({
      browser: "firefox",
      executablePath:
        process.env.FIREFOX_BINARY ||
        path.join(os.homedir(), "UAT-firefox/firefox/firefox"),
      headless: true,
      extraPrefsFirefox: { "media.autoplay.default": 0 },
      defaultViewport: { width: 1440, height: 1000 },
      protocolTimeout: 180000,
    });
    owned.add(browser.process().pid);
    page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const url = "http://127.0.0.1:" + server.address().port;
    await page.goto(url + "/video-editor.html");
    await ready();
    console.log(await browser.version());
    await layout("empty-1440", 1440, 1000);
    await layout("empty-320", 320, 568);
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await (await page.$("#videoFiles")).uploadFile(fixture);
    await page.waitForFunction(
      () => UsefulToolVideoEditor.project.items.length === 2,
    );
    let p = await state();
    check(
      "video upload exposes both ear waveforms in Your movie by default",
      await page.$$eval(".item-audio .clip-channel", (e) => e.length === 2),
    );
    // Exercise the media-library drop handler after deleting the automatic placement.
    await click('#timelineHead [data-help-id="deleteItem"]');
    await page.evaluate(() => {
      const a = UsefulToolVideoEditor.project.assets[0],
        data = new DataTransfer();
      data.setData("application/x-utv-asset", a.id);
      const target = document.querySelector('.track-row[data-layer-id="main"]'),
        r = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          dataTransfer: data,
          clientX: r.left + 150,
          clientY: r.top + 20,
        }),
      );
    });
    check(
      "dragging library video into Main video creates picture and original sound",
      (await state()).items.length === 2,
    );
    await click("#decoupleChannelsButton");
    p = await state();
    const left = p.items.find((i) => i.audio?.sourceChannel === "left"),
      right = p.items.find((i) => i.audio?.sourceChannel === "right"),
      video = p.items.find((i) => i.kind === "video");
    check(
      "decouple creates independent named L/R timeline tracks",
      !!left &&
        !!right &&
        left.layerId !== right.layerId &&
        !left.linkEnabled &&
        !right.linkEnabled,
    );
    await select(right.id);
    await input('[data-control="startsAt"]', 15);
    p = await state();
    check(
      "right ear starts exactly 15 seconds after left while picture stays fixed",
      p.items.find((i) => i.id === right.id).start === 15 &&
        p.items.find((i) => i.id === left.id).start === 0 &&
        p.items.find((i) => i.id === video.id).start === 0,
      p.items.map((i) => [i.name, i.start]),
    );
    // Use a real pointer drag to move the left segment, then restore the exact ASMR offset.
    await select(left.id);
    let box = await (
      await page.$(`.timeline-item[data-item-id="${left.id}"]`)
    ).boundingBox();
    const zoom = await page.$eval(
      '[aria-label="Timeline zoom"]',
      (e) => +e.value,
    );
    await page.mouse.move(box.x + 80, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 80 + zoom * 2, box.y + 20, { steps: 8 });
    await page.mouse.up();
    p = await state();
    check(
      "pointer drag moves only the selected ear",
      p.items.find((i) => i.id === left.id).start > 1.9 &&
        p.items.find((i) => i.id === right.id).start === 15,
    );
    await command("z");
    await select(left.id);
    await click('[data-track-toggle="main"]');
    check(
      "video track off hides picture while keeping both sound segments",
      await page.evaluate(() => {
        const a = UsefulToolVideoEditor;
        return (
          a.Model.evaluateFrame(a.project, 16).items.length === 0 &&
          a.Model.evaluateAudio(a.project, 16).length === 2
        );
      }),
    );
    await click('[data-track-toggle="main"]');
    await click(`[data-track-toggle="${left.layerId}"]`);
    check(
      "left track off silences only left ear",
      await page.evaluate(() => {
        const a = UsefulToolVideoEditor;
        return a.Model.evaluateAudio(a.project, 16).every(
          (e) => e.right > 0 && e.left === 0,
        );
      }),
    );
    await click(`[data-track-toggle="${left.layerId}"]`);
    const audio = await page.evaluate(async () => {
      const a = UsefulToolVideoEditor,
        M = a.Model,
        S = UTStudio.Export.Sources,
        rate = 48000,
        length = 47 * rate;
      const sources = new S(a.project, a.library, 0, 47),
        mix = await sources.mix(0, length),
        context = new OfflineAudioContext(2, length, rate);
      const limiter = UTStudio.Audio.createLimiter(context);
      limiter.connect(context.destination);
      for (const item of a.project.items.filter((i) => i.audio)) {
        const pcm = await sources.audio(item.assetId),
          buffer = context.createBuffer(2, pcm.left.length, pcm.sampleRate);
        buffer.copyToChannel(pcm.left, 0);
        buffer.copyToChannel(pcm.right, 1);
        const src = context.createBufferSource();
        src.buffer = buffer;
        const route = UTStudio.Audio.createRouting(context, src, limiter);
        route.apply(M.audioGains(a.project, item, item.start), 0);
        src.start(item.start, item.sourceIn, M.span(item));
      }
      const preview = await context.startRendering();
      let maxDiff = 0;
      for (let ch = 0; ch < 2; ch++) {
        const x = mix.getChannelData(ch),
          y = preview.getChannelData(ch);
        for (let i = 0; i < length; i++)
          maxDiff = Math.max(maxDiff, Math.abs(x[i] - y[i]));
      }
      const tone = (ch, t, hz) => {
        const data = mix.getChannelData(ch);
        let s = 0,
          c = 0;
        for (let j = 0; j < rate; j++) {
          const at = Math.floor(t * rate) + j;
          s += data[at] * Math.sin((2 * Math.PI * hz * j) / rate);
          c += data[at] * Math.cos((2 * Math.PI * hz * j) / rate);
        }
        return (2 * Math.hypot(s, c)) / rate;
      };
      const result = {
        maxDiff,
        leftBefore: tone(0, 3, 440),
        rightBefore: tone(1, 3, 880),
        leftAfter: tone(0, 16, 440),
        rightAfter: tone(1, 16, 880),
        wrongLeft: tone(0, 16, 880),
        wrongRight: tone(1, 16, 440),
      };
      await sources.dispose();
      return result;
    });
    check(
      "preview routing matches export PCM with original ears and a 15-second delay",
      audio.maxDiff < 0.0001 &&
        audio.leftBefore > 0.1 &&
        audio.rightBefore < 0.00001 &&
        audio.leftAfter > 0.1 &&
        audio.rightAfter > 0.1 &&
        audio.wrongLeft < 0.001 &&
        audio.wrongRight < 0.001,
      audio,
    );
    const encoded = await page.evaluate(async () => {
      const a = UsefulToolVideoEditor;
      a.project.exportSettings.quality = "high";
      a.project.exportSettings.fps = 15;
      a.project.exportSettings.bitrate = 1;
      const r = await a.engine.recordRange(0, 17),
        bytes = new Uint8Array(await r.blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { base64: btoa(binary), width: r.width, height: r.height };
    });
    const exportFile = path.join(reports, "ears-15-second-offset.webm");
    fs.writeFileSync(exportFile, Buffer.from(encoded.base64, "base64"));
    const pcm = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        exportFile,
        "-vn",
        "-f",
        "f32le",
        "-ac",
        "2",
        "-ar",
        "48000",
        "pipe:1",
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    const tone = (channel, seconds, hz) => {
      let sin = 0,
        cos = 0;
      for (let i = 0; i < 48000; i++) {
        const sample = pcm.readFloatLE(
          ((seconds * 48000 + i) * 2 + channel) * 4,
        );
        sin += sample * Math.sin((2 * Math.PI * hz * i) / 48000);
        cos += sample * Math.cos((2 * Math.PI * hz * i) / 48000);
      }
      return (2 * Math.hypot(sin, cos)) / 48000;
    };
    const decoded = {
      leftBefore: tone(0, 3, 440),
      rightBefore: tone(1, 3, 880),
      leftAfter: tone(0, 16, 440),
      rightAfter: tone(1, 16, 880),
      wrongLeft: tone(0, 16, 880),
      wrongRight: tone(1, 16, 440),
    };
    check(
      "FFmpeg-decoded export preserves original ears and the actual 15-second delay",
      decoded.leftBefore > 0.1 &&
        decoded.rightBefore < 0.00001 &&
        decoded.leftAfter > 0.1 &&
        decoded.rightAfter > 0.1 &&
        decoded.wrongLeft < 0.001 &&
        decoded.wrongRight < 0.001,
      decoded,
    );
    const streams = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-show_streams",
          "-of",
          "json",
          exportFile,
        ],
        { encoding: "utf8" },
      ),
    ).streams;
    check(
      "encoded export has every video frame and two audio channels",
      streams.some(
        (s) => s.codec_type === "video" && +s.nb_read_frames === 255,
      ) && streams.some((s) => s.codec_type === "audio" && s.channels === 2),
    );
    await select(left.id);
    await command("c");
    await page.evaluate(() => UsefulToolVideoEditor.seekTo(35));
    await command("v");
    p = await state();
    const pasted = p.items.find(
      (i) => i.audio?.sourceChannel === "left" && i.id !== left.id,
    );
    check(
      "real Ctrl+C/Ctrl+V pastes an ear at the playhead with a new identity",
      pasted?.start === 35 &&
        pasted.audio.rightGain === 0 &&
        pasted.sourceIn === left.sourceIn,
    );
    await command("z");
    check("one Undo removes paste", (await state()).items.length === 3);
    await command("y");
    check("Redo restores paste", (await state()).items.length === 4);
    await command("z");
    // Native text editing must retain its own clipboard behavior.
    await select(right.id);
    await click('[data-control="startsAt"]');
    await command("a");
    await command("c");
    await command("v");
    check(
      "copy/paste in an input does not add timeline segments",
      (await state()).items.length === 3,
    );
    await page.keyboard.press("Tab");
    await select(video.id);
    await command("c");
    await page.evaluate(() => UsefulToolVideoEditor.seekTo(10));
    await command("v");
    check(
      "video Ctrl+V inserts at an interior playhead",
      await page.evaluate(
        () =>
          UsefulToolVideoEditor.selectedItem.start === 10 &&
          UsefulToolVideoEditor.selectedItem.kind === "video",
      ),
    );
    await command("z");
    await page.evaluate(() => UsefulToolVideoEditor.setStep("export"));
    await page.$eval(
      "#segmentInterval",
      (e) => (e.closest("details").open = true),
    );
    await click('[data-control="segmentCuts"]');
    let index = await page.$$eval(".segment-index", (es) =>
      es.map((e) => ({
        n: +e.dataset.segmentIndex,
        label: e.textContent,
        title: e.title,
      })),
    );
    check(
      "Show interval cuts numbers every interval including first and final",
      index.length === 24 &&
        index[0].n === 1 &&
        index.at(-1).n === 24 &&
        index[0].label === "#1",
      index.slice(0, 3),
    );
    await input("#segmentInterval", 0.1);
    check(
      "dense interval indices keep every segment accessible",
      await page.$$eval(
        ".segment-index",
        (es) =>
          es.length === 470 &&
          es.every((e) => e.getAttribute("aria-label").startsWith("Segment ")),
      ),
    );
    await layout("dense-1366", 1366, 768);
    await input("#segmentInterval", 2);
    await page.evaluate(() => UsefulToolVideoEditor.setStep("arrange"));
    await select(right.id);
    await page.waitForFunction(
      () => document.getElementById("undoToast").hidden,
    );
    const layouts = [];
    for (const [name, w, h, d] of [
      ["desktop-1440", 1440, 1000, 1],
      ["laptop-1366", 1366, 768, 1],
      ["wide-1920", 1920, 1080, 1],
      ["ultrawide-2560", 2560, 1080, 1],
      ["4k-3840", 3840, 2160, 1],
      ["hidpi-1440", 1440, 1000, 2],
      ["tablet-1024", 1024, 768, 1],
      ["portrait-820", 820, 1180, 1],
      ["mobile-390", 390, 844, 1],
      ["small-320", 320, 568, 1],
      ["short-844", 844, 390, 1],
    ])
      layouts.push(await layout(name, w, h, d));
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await click('[data-help-id="contextDrawer"]');
    await click('[data-control="startsAt"]');
    const inspector = await page.evaluate(() => {
      const p = document.getElementById("contextPanel"),
        r = p.getBoundingClientRect();
      return {
        width: r.width,
        visible: getComputedStyle(p).display !== "none",
        outside: [...p.querySelectorAll("input,select,button:not(.touch-help)")]
          .filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width && (b.left < r.left || b.right > r.right);
          })
          .map((e) => e.getAttribute("aria-label")),
      };
    });
    check(
      "phone inspector keeps ear timing and sound controls within its bounds",
      inspector.visible && !inspector.outside.length,
      inspector,
    );
    await page.keyboard.press("Tab");
    await page.mouse.move(1, 1);
    await screenshot("phone-ear-inspector");
    await click('[aria-label="Close editing controls"]');
    // 720 CSS pixels at 2x density renders a 1440-pixel image with 200% display scaling.
    const zoomed = await layout("scaled-200-percent", 720, 500, 2);
    check(
      "200% display scaling reflows into a readable narrow layout",
      zoomed.dpr === 2 && zoomed.width === 720,
    );
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.evaluate(() => UsefulToolVideoEditor.store.flush());
    const saved = await state();
    await page.reload();
    await ready();
    await click("#continueProjectButton");
    await page.waitForFunction(
      () =>
        !UsefulToolVideoEditor.loading &&
        UsefulToolVideoEditor.project.items.length === 3,
    );
    check(
      "refresh recovery retains ear offsets and routing",
      JSON.stringify((await state()).items) === JSON.stringify(saved.items),
    );
    await (await page.$("#musicFiles")).uploadFile(mp3);
    await page.waitForSelector("#studioDialog[open]");
    await click('#studioDialog [data-help-id="startHere"]');
    await click("#decoupleChannelsButton");
    p = await state();
    check(
      "uploaded MP3 decouples into independent left and right ears",
      p.items.filter(
        (i) => i.audio?.category === "music" && i.audio.sourceChannel,
      ).length === 2,
    );
    // Avoid the deliberate four-source conflict before a real playback check.
    await click('[data-track-toggle="video-sound-left"]');
    await click('[data-track-toggle="video-sound-right"]');
    await page.evaluate(() => UsefulToolVideoEditor.seekTo(16));
    await click("#playButton");
    await page.waitForFunction(
      () =>
        UsefulToolVideoEditor.engine.playing &&
        UsefulToolVideoEditor.project.playhead > 16.2,
    );
    check(
      "decoupled MP3 plays through the real preview engine",
      await page.evaluate(() => UsefulToolVideoEditor.mixer.chains.size >= 2),
    );
    await page.evaluate(() => UsefulToolVideoEditor.engine.stop());
    await screenshot("mp3-decoupled");
    await page.goto(
      require("node:url").pathToFileURL(
        path.join(root, "offline/video-editor.html"),
      ).href,
    );
    await ready();
    await (await page.$("#videoFiles")).uploadFile(fixture);
    await page.waitForFunction(
      () => UsefulToolVideoEditor.project.items.length === 2,
    );
    await click("#decoupleChannelsButton");
    check(
      "offline HTML opens from disk and decouples video into both ear tracks",
      (await state()).items.filter((i) => i.audio?.sourceChannel).length === 2,
    );
    await screenshot("offline-ears");
    check(
      "no application errors during Firefox acceptance",
      errors.length === 0,
      errors,
    );
    fs.writeFileSync(
      path.join(reports, "report.json"),
      JSON.stringify(
        {
          browser: await browser.version(),
          checks,
          audio,
          decoded,
          layouts,
          zoomed,
          errors,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (page) {
      await screenshot("failure").catch(() => {});
      console.error(
        await page
          .evaluate(() => ({
            error: document.getElementById("contextError")?.textContent,
            ready: window.UsefulToolVideoEditor?.ready,
            items: window.UsefulToolVideoEditor?.project.items.map((i) => ({
              id: i.id,
              name: i.name,
              start: i.start,
              end: i.end,
            })),
          }))
          .catch(() => null),
      );
    }
    fs.writeFileSync(
      path.join(reports, "failure.json"),
      JSON.stringify({ checks, errors, error: error.stack }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      for (const p of descendants(browser.process().pid)) owned.add(p.pid);
      await browser.close().catch(() => {});
    }
    for (const pid of owned) {
      try {
        process.kill(pid, 0);
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    server.close();
    console.log("Closed owned Firefox processes:", [...owned].join(", "));
  }
})();
