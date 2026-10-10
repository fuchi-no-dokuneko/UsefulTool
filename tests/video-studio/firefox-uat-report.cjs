// Native-input regressions for the six October 1 UAT findings.
const { launch } = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const M = require("../../assets/pages/video-studio/model.js");
const root = path.resolve(__dirname, "../..");
const reportName = process.env.REPORT_NAME || "current";
const reports = path.join(
  root,
  "build/reports/video-studio/uat-report",
  reportName,
);
fs.mkdirSync(reports, { recursive: true });
const fixture = path.join(reports, "pattern.mp4");
if (!fs.existsSync(fixture))
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=24:duration=6",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=6",
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
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + new URL(req.url, "http://localhost").pathname,
  );
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  )
    return res.writeHead(404).end();
  res.writeHead(200, {
    "Content-Type":
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        path.extname(file)
      ] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});
const checks = [],
  errors = [],
  owned = new Set();
let browser, page, url, downloads;
const check = (name, condition, detail) => {
  checks.push({ name, passed: !!condition, detail });
  console.log((condition ? "PASS " : "FAIL ") + name);
  assert.ok(condition, name + ": " + JSON.stringify(detail));
};
async function click(selector) {
  await page.locator(selector).click();
}
async function field(selector, value, commit = "Tab") {
  await click(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  if (value === "") await page.keyboard.press("Backspace");
  else await page.keyboard.type(String(value));
  if (commit === "click") await click("#stageHead");
  else await page.keyboard.press(commit);
}
async function openDetails(title) {
  const selector = await page.evaluate((title) => {
    const summary = [
      ...document.querySelectorAll("#contextPanel summary"),
    ].find((e) => e.textContent === title);
    if (!summary) throw new Error("Missing section: " + title);
    if (summary.parentElement.open) return null;
    summary.id = "uat-section";
    return "#uat-section";
  }, title);
  if (selector) {
    await click(selector);
    await page.$eval(selector, (e) => e.removeAttribute("id"));
  }
}
async function reveal(selector) {
  const titles = await page.$eval(selector, (e) => {
    const titles = [];
    for (let p = e.parentElement; p; p = p.parentElement)
      if (p.tagName === "DETAILS" && !p.open)
        titles.unshift(p.querySelector("summary").textContent);
    return titles;
  });
  for (const title of titles) await openDetails(title);
}
async function select(kind) {
  const id = await page.evaluate(
    (kind) =>
      UsefulToolVideoEditor.project.items.find((i) => i.kind === kind).id,
    kind,
  );
  await page.evaluate((id) => UsefulToolVideoEditor.selectItem(id), id);
  await page.waitForFunction(() => !UsefulToolVideoEditor.engine.seeking);
  return id;
}
async function addEffect() {
  await click('[data-help-id="addEffect"]');
  await click('#studioDialog [data-help-id="brightness"]');
}
async function lockedSound() {
  await select("audio");
  await click('#contextPanel [data-help-id="lockItem"]');
  return select("video");
}
async function state() {
  return page.evaluate(() => structuredClone(UsefulToolVideoEditor.project));
}
async function waitFor(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for downloaded file");
}
async function downloaded(action, extension) {
  const before = new Set(fs.readdirSync(downloads));
  await action();
  return waitFor(() => {
    const name = fs
      .readdirSync(downloads)
      .find(
        (n) =>
          !before.has(n) &&
          n.endsWith(extension) &&
          !fs.existsSync(path.join(downloads, n + ".part")),
      );
    return (
      name &&
      fs.statSync(path.join(downloads, name)).size > 0 &&
      path.join(downloads, name)
    );
  });
}
async function saveFile() {
  await click("#projectMenuButton");
  return downloaded(
    () => click('#studioDialog button[data-help-id="saveProject"]'),
    ".utvproj",
  );
}
function probe(file, fps, sound, duration = 6) {
  const data = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    ),
  );
  const v = data.streams.find((s) => s.codec_type === "video"),
    a = data.streams.find((s) => s.codec_type === "audio");
  check(
    "VE05 downloaded video metadata " + path.basename(file),
    v?.width === 640 &&
      v.height === 360 &&
      v.r_frame_rate === fps + "/1" &&
      Number(v.nb_read_frames) === Math.round(fps * duration) &&
      !!a === sound &&
      (!a || (a.channels === 2 && a.sample_rate === "48000")) &&
      Math.abs(Number(data.format.duration) - duration) < 1 / fps,
    { video: v, audio: a, format: data.format },
  );
  const pixels = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=32:18",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 100000 },
  );
  check(
    "VE05 downloaded video contains the picture " + path.basename(file),
    pixels.reduce((sum, p) => sum + p, 0) / pixels.length > 25,
  );
  return data;
}
async function renderDownload() {
  await click("#exportButton");
  await page.waitForFunction(
    () =>
      !UsefulToolVideoEditor.exporting && UsefulToolVideoEditor.results.length,
    { timeout: 120000 },
  );
  const ext = await page.evaluate(
    () => "." + UsefulToolVideoEditor.results[0].extension,
  );
  return downloaded(() => click("#downloadButton"), ext);
}
async function recovered() {
  await page.evaluate(() => UsefulToolVideoEditor.store.flush());
  await page.reload();
  await page.waitForFunction(() => window.UsefulToolVideoEditor?.ready);
  await click("#continueProjectButton");
  await page.waitForFunction(
    () =>
      !UsefulToolVideoEditor.loading &&
      UsefulToolVideoEditor.project.items.length > 0 &&
      !UsefulToolVideoEditor.engine.seeking,
  );
}
async function fresh(name, run) {
  if (process.env.CASES && !process.env.CASES.split(",").includes(name)) return;
  downloads = path.join(reports, name + "-downloads");
  fs.mkdirSync(downloads, { recursive: true });
  const context = await browser.createBrowserContext({
    downloadBehavior: { policy: "allow", downloadPath: downloads },
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push({ name, error: String(e) }));
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.UsefulToolVideoEditor?.ready);
    await (await page.$("#videoFiles")).uploadFile(fixture);
    await page.waitForFunction(
      () =>
        UsefulToolVideoEditor.project.items.length === 2 &&
        !UsefulToolVideoEditor.loading &&
        !UsefulToolVideoEditor.engine.seeking,
    );
    await select("video");
    await run();
  } catch (error) {
    if (!checks.at(-1)?.name.startsWith(name) || checks.at(-1)?.passed)
      checks.push({ name, passed: false, error: error.stack });
    console.error(name, error.message);
    process.exitCode = 1;
  } finally {
    await page
      .screenshot({ path: path.join(reports, name + ".png"), fullPage: true })
      .catch(() => {});
    await context.close();
  }
}
(async () => {
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = "http://127.0.0.1:" + server.address().port + "/video-editor.html";
    browser = await launch({
      browser: "firefox",
      executablePath:
        process.env.FIREFOX_BINARY ||
        path.join(
          require("node:os").homedir(),
          "UAT-firefox/version-153/firefox/firefox",
        ),
      headless: process.env.FIREFOX_HEADED !== "1",
      defaultViewport: { width: 1180, height: 757 },
      extraPrefsFirefox: {
        "media.autoplay.default": 0,
        "browser.download.folderList": 2,
        "browser.download.dir": reports,
        "browser.helperApps.neverAsk.saveToDisk":
          "application/json,application/octet-stream,video/webm,video/mp4,application/zip",
        "browser.download.alwaysOpenPanel": false,
      },
      protocolTimeout: 180000,
    });
    owned.add(browser.process().pid);
    await fresh("VE01", async () => {
      await addEffect();
      for (const commit of ["Enter", "Tab", "click"])
        for (const reverse of [false, true]) {
          await page.evaluate(() => {
            const app = UsefulToolVideoEditor,
              v = app.project.items[0];
            app.edit(
              () =>
                app.Model.setEffectRange(app.project, v.id, v.effects[0].id, {
                  start: 0,
                  end: 6,
                }),
              "Reset test range",
              { context: true },
            );
            window.uatEffectField = document.querySelector(
              '[data-control="effectStart"]',
            );
          });
          await field(
            '[data-control="' + (reverse ? "effectStart" : "effectEnd") + '"]',
            reverse ? 4 : 2,
            commit,
          );
          await field(
            '[data-control="' + (reverse ? "effectEnd" : "effectStart") + '"]',
            reverse ? 2 : 4,
            commit,
          );
          const fx = (await state()).items[0].effects[0],
            expected = reverse ? 4 : 2;
          check(
            "VE01 coupled endpoints " + commit + " reverse=" + reverse,
            fx.start === expected &&
              fx.end === expected &&
              (await page.evaluate(
                () =>
                  window.uatEffectField ===
                  document.querySelector('[data-control="effectStart"]'),
              )),
            fx,
          );
          check(
            "VE01 displayed endpoints match accepted values " +
              commit +
              reverse,
            await page.evaluate(
              (expected) =>
                [
                  ...document.querySelectorAll(
                    '[data-control="effectStart"], [data-control="effectEnd"]',
                  ),
                ].every((e) => Number(e.value) === expected),
              expected,
            ),
          );
          await select("video");
          check(
            "VE01 range survives reselection " + commit + reverse,
            (await page.$eval('[data-control="effectStart"]', (e) =>
              Number(e.value),
            )) === expected,
          );
        }
      await field('[data-control="effectStart"]', 1);
      await field('[data-control="effectEnd"]', 3);
      await page.evaluate(() => UsefulToolVideoEditor.undo());
      check(
        "VE01 undo restores preceding valid range",
        (await state()).items[0].effects[0].end === 4,
      );
      await page.evaluate(() => UsefulToolVideoEditor.redo());
      await field('input[type="number"][data-control="effectAmount"]', 0.5);
      const saved = await state();
      check(
        "VE01 redo and strict serialization agree with active effect",
        M.parseProject(M.serialize(saved)).items[0].effects[0].end === 3 &&
          M.evaluateFrame(saved, 2).items[0].effects.length === 1 &&
          M.evaluateFrame(saved, 4).items[0].effects.length === 0,
      );
      const file = await saveFile(),
        parsed = M.parseProject(fs.readFileSync(file, "utf8"));
      check(
        "VE01 actual saved project preserves edits",
        JSON.stringify(parsed.items) === JSON.stringify(saved.items),
        file,
      );
      // Reopen received bytes in a clean browser tab/storage context: media must
      // really be relinked rather than reused from the current in-memory library.
      const other = await browser.createBrowserContext();
      const first = page;
      page = await other.newPage();
      try {
        await page.goto(url);
        await page.waitForFunction(() => window.UsefulToolVideoEditor?.ready);
        await (await page.$("#projectFile")).uploadFile(file);
        await page.waitForFunction(
          () =>
            !UsefulToolVideoEditor.loading &&
            UsefulToolVideoEditor.project.items.length === 2,
        );
        check(
          "VE01 external Open retains effects and requests media",
          (await state()).items[0].effects[0].end === 3 &&
            (await page.evaluate(
              () =>
                !UsefulToolVideoEditor.library.has(
                  UsefulToolVideoEditor.project.assets[0].id,
                ),
            )),
        );
        const chooser = page.waitForFileChooser();
        await click('button[data-help-id="relink"]');
        await (await chooser).accept([fixture]);
        await page.waitForFunction(
          () =>
            UsefulToolVideoEditor.library.has(
              UsefulToolVideoEditor.project.assets[0].id,
            ) && !UsefulToolVideoEditor.engine.seeking,
        );
        await page.evaluate(() => UsefulToolVideoEditor.seekTo(2));
        await page.screenshot({
          path: path.join(reports, "VE01-relinked.png"),
        });
        check(
          "VE01 relink restores preview with same project",
          JSON.stringify((await state()).items) ===
            JSON.stringify(parsed.items),
        );
        await recovered();
        check(
          "VE01 relinked project and media survive reload",
          (await state()).items[0].effects[0].end === 3 &&
            (await page.evaluate(() =>
              UsefulToolVideoEditor.library.has(
                UsefulToolVideoEditor.project.assets[0].id,
              ),
            )),
        );
      } finally {
        await other.close();
        page = first;
      }
      await recovered();
      check(
        "VE01 valid effects survive recovery",
        (await state()).items[0].effects.length === 1,
      );
      await click("#step-export");
      await page.select('[data-control="quality"]', "high");
      await openDetails("Technical settings");
      await field('[data-control="fps"]', 24);
      const movie = await renderDownload();
      probe(movie, 24, true);
      const mean = (file, time) => {
        const pixels = execFileSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-ss",
            String(time),
            "-i",
            file,
            "-frames:v",
            "1",
            "-vf",
            "scale=32:18",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
          ],
          { maxBuffer: 10000 },
        );
        return pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
      };
      const ratios = [0, 2, 4].map(
        (time) => mean(movie, time) / mean(fixture, time),
      );
      check(
        "VE01 downloaded effect is active only inside the saved interval",
        ratios[0] > 0.9 &&
          ratios[0] < 1.1 &&
          ratios[1] > 0.4 && ratios[1] < 0.6 &&
          ratios[2] > 0.9 &&
          ratios[2] < 1.1,
        ratios,
      );
    });
    await fresh("VE01-storage", async () => {
      await addEffect();
      const result = await page.evaluate(async () => {
        const app = UsefulToolVideoEditor,
          store = app.store,
          M = app.Model;
        await store.flush();
        const read = () =>
          store.transact("projects", "readonly", (s) => s.get(store.key));
        const good = await read(),
          bad = M.copy(app.project);
        bad.items[0].effects[0].start = 4;
        bad.items[0].effects[0].end = 2;
        let rejected = false;
        try {
          store.schedule(bad);
        } catch {
          rejected = true;
        }
        await store.flush();
        const untouched = await read();
        app.project.name = "Latest valid edit";
        store.schedule(app.project);
        await store.flush();
        const next = await read();
        const snapshot = JSON.parse(next.json);
        snapshot.items[0].effects[0].amount = null;
        await store.transact("projects", "readwrite", (s) =>
          s.put({ ...next, json: JSON.stringify(snapshot) }, store.key),
        );
        const fallback = await store.load(),
          message = store.recoveryMessage;
        await store.transact("projects", "readwrite", (s) =>
          s.put({ json: JSON.stringify(bad) }, store.key),
        );
        const repaired = await store.load();
        return {
          rejected,
          untouched: untouched.json === good.json,
          backup: next.previous === good.json,
          fallback: fallback.name === JSON.parse(good.json).name,
          message,
          range: repaired.items[0].effects[0],
        };
      });
      check(
        "VE01 invalid save leaves only valid recovery untouched",
        result.rejected && result.untouched && result.backup,
        result,
      );
      check(
        "VE01 unrelated corruption falls back to validated backup",
        result.fallback && result.message.includes("previous valid"),
      );
      check(
        "VE01 old inverted snapshot is narrowly repaired",
        result.range.start === 2 && result.range.end === 4,
      );
      await page.reload();
      await page.waitForFunction(() => window.UsefulToolVideoEditor?.ready);
      check(
        "VE01 recovery explains repaired timing",
        await page.$eval("#studioDialog", (e) =>
          e.textContent.includes("Recovered invalid effect timing"),
        ),
      );
      await click("#continueProjectButton");
      await page.waitForFunction(
        () =>
          !UsefulToolVideoEditor.loading &&
          UsefulToolVideoEditor.project.items.length === 2,
      );
      check(
        "VE01 repaired session retains all items",
        (await state()).items[0].effects[0].end === 4,
      );
    });
    await fresh("VE02", async () => {
      for (const target of ["video", "audio"])
        for (const lock of ["item", "layer"]) {
          await page.evaluate(
            ({ target, lock }) => {
              const app = UsefulToolVideoEditor,
                M = app.Model;
              app.edit(
                () => {
                  for (const i of app.project.items) i.locked = false;
                  for (const l of app.project.layers) l.locked = false;
                  const v = app.project.items.find((i) => i.kind !== target);
                  (lock === "item"
                    ? v
                    : M.layer(app.project, v.layerId)
                  ).locked = true;
                },
                "Set up locks",
                { context: true },
              );
            },
            { target, lock },
          );
          await select(target);
          for (const [id, n] of [
            ["sourceIn", 1],
            ["sourceOut", 5],
            ["sourceIn", 2],
          ]) {
            const before = await page.evaluate(async () => {
              const app = UsefulToolVideoEditor;
              await app.store.flush();
              return {
                project: app.Model.serialize(app.project),
                index: app.history.index,
                entries: app.history.entries.length,
                saved: (await app.store.load()).items,
              };
            });
            await openDetails("More settings");
            await field('[data-control="' + id + '"]', n);
            const after = await page.evaluate(async () => {
              const app = UsefulToolVideoEditor;
              await app.store.flush();
              return {
                project: app.Model.serialize(app.project),
                index: app.history.index,
                entries: app.history.entries.length,
                saved: (await app.store.load()).items,
              };
            });
            check(
              "VE02 rejection is atomic " + target + lock + id + n,
              JSON.stringify(after) === JSON.stringify(before),
            );
          }
        }
      await page.evaluate(() => {
        const app = UsefulToolVideoEditor;
        app.edit(
          () => {
            for (const i of app.project.items) i.locked = false;
            for (const l of app.project.layers) l.locked = false;
          },
          "Unlock",
          { context: true },
        );
      });
      await select("audio");
      await openDetails("More settings");
      await field('[data-control="sourceIn"]', 1);
      await openDetails("More settings");
      await field('[data-control="sourceOut"]', 5);
      const synced = (await state()).items;
      check(
        "VE02 unlocked linked pair trims together",
        synced.every(
          (i) =>
            i.sourceIn === 1 &&
            i.sourceOut === 5 &&
            i.start === 0 &&
            i.end === 4,
        ),
      );
      await page.evaluate(() => UsefulToolVideoEditor.undo());
      check(
        "VE02 source undo restores both linked items",
        (await state()).items.every((i) => i.sourceOut === 6 && i.end === 5),
      );
      await page.evaluate(() => UsefulToolVideoEditor.redo());
      await recovered();
      check(
        "VE02 source redo and recovery retain synchronized items",
        JSON.stringify((await state()).items) === JSON.stringify(synced),
      );
    });
    await fresh("VE03", async () => {
      await lockedSound();
      const speed = await page.$$('[data-help-id="speed"]');
      for (const button of speed)
        if ((await button.evaluate((e) => e.textContent)) === "2×") {
          await button.click();
          break;
        }
      check(
        "VE03 speed rejection is visible",
        await page.$eval("#contextError", (e) =>
          e.textContent.includes("Unlock"),
        ),
      );
      await openDetails("Position and size");
      await field('[data-control="positionX"]', 100);
      check(
        "VE03 next transform edits current project",
        (await state()).items[0].transform.x === 100,
      );
      await addEffect();
      for (const failure of ["speed", "sourceIn", "sourceOut", "speed"]) {
        if (failure === "speed") {
          for (const button of await page.$$('button[data-help-id="speed"]'))
            if (await button.evaluate((e) => e.textContent === "2×")) {
              await button.click();
              break;
            }
        } else {
          await openDetails("More settings");
          await field(
            '[data-control="' + failure + '"]',
            failure === "sourceIn" ? 1 : 5,
          );
        }
        check(
          "VE03 repeated rejection still shows the error " + failure,
          await page.$eval(
            "#contextError",
            (e) => !e.hidden && e.textContent.includes("Unlock"),
          ),
        );
        await openDetails("Position and size");
        await field('[data-control="positionX"]', 120, "click");
        await field('[data-control="width"]', 480, "Enter");
        await field('input[type="number"][data-control="visibility"]', 75);
        await field('input[type="number"][data-control="effectAmount"]', 1.5);
        const v = (await state()).items[0];
        check(
          "VE03 all later edits reach current nested objects " + failure,
          v.transform.x === 120 &&
            v.transform.width === 480 &&
            v.opacity === 0.75 &&
            v.effects[0].amount === 1.5,
          v,
        );
        await select("audio");
        await select("video");
      }
      await openDetails("Position and size");
      await field('[data-control="positionX"]', 140);
      await page.evaluate(() => UsefulToolVideoEditor.undo());
      check(
        "VE03 post-error undo reaches prior transform",
        (await state()).items[0].transform.x === 120,
      );
      await page.evaluate(() => UsefulToolVideoEditor.redo());
      await page.evaluate(() => UsefulToolVideoEditor.seekTo(1));
      await page.screenshot({
        path: path.join(reports, "VE03-post-error-preview.png"),
      });
      const visual = await page.evaluate(() => {
        const app = UsefulToolVideoEditor,
          c = document.getElementById("previewCanvas"),
          ctx = c.getContext("2d");
        const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
        let dark = 0,
          lit = 0;
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const p = (y * c.width + x) * 4,
              brightness = Math.max(...pixels.slice(p, p + 3));
            if (x < c.width * 0.15 && brightness < 10) dark++;
            if (x > c.width * 0.25 && brightness > 40) lit++;
          }
        return (
          dark > c.width * c.height * 0.14 && lit > c.width * c.height * 0.15
        );
      });
      check("VE03 preview reflects accepted shifted picture", visual);
      const file = await saveFile();
      check(
        "VE03 received project contains post-error edits",
        M.parseProject(fs.readFileSync(file, "utf8")).items[0].transform.x ===
          140,
      );
      await recovered();
      check(
        "VE03 redo and recovery retain later edits",
        (await state()).items[0].transform.x === 140 &&
          (await state()).items[0].effects[0].amount === 1.5,
      );
    });
    await fresh("VE02-export", async () => {
      await lockedSound();
      await click("#step-export");
      await page.select('[data-control="quality"]', "high");
      const first = await renderDownload();
      await click("#step-effects");
      await select("video");
      const index = await page.evaluate(
        () => UsefulToolVideoEditor.history.index,
      );
      await openDetails("More settings");
      await field('[data-control="sourceIn"]', 1);
      check(
        "VE02 rejection retains a valid export and history",
        await page.evaluate(
          (index) =>
            UsefulToolVideoEditor.results.length === 1 &&
            UsefulToolVideoEditor.history.index === index,
          index,
        ),
      );
      await click("#step-export");
      const again = await downloaded(() => click("#downloadButton"), ".webm");
      check(
        "VE02 unchanged movie remains downloadable after rejection",
        fs.readFileSync(first).equals(fs.readFileSync(again)),
      );
    });
    await fresh("VE04", async () => {
      const selector = '[aria-label="Timeline zoom"]';
      await page.$eval(selector, (e) => e.focus());
      const before = await page.$eval(selector, (e) => Number(e.value)),
        time = (await state()).playhead;
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      check(
        "VE04 repeated arrows retain zoom focus without seeking",
        (await page.$eval(
          selector,
          (e, before) =>
            e === document.activeElement && Number(e.value) === before + 10,
          before,
        )) && (await state()).playhead === time,
      );
      await page.$eval(selector, (e) => {
        window.uatZoom = e;
      });
      const selected = (await state()).selectedItemId;
      for (const [key, limit] of [
        ["ArrowRight", 300],
        ["ArrowLeft", 15],
        ["End", 300],
        ["Home", 15],
      ]) {
        const count = key.startsWith("Arrow") ? 65 : 1;
        for (let i = 0; i < count; i++) await page.keyboard.press(key);
        check(
          "VE04 key bound " + key,
          (await page.$eval(
            selector,
            (e, limit) =>
              e === window.uatZoom &&
              e === document.activeElement &&
              Number(e.value) === limit,
            limit,
          )) && (await state()).playhead === time,
        );
      }
      const rect = await page.$eval(selector, (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      await page.mouse.move(rect.x + 7, rect.y + rect.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        rect.x + rect.width * 0.8,
        rect.y + rect.height / 2,
        { steps: 12 },
      );
      const during = await page.$eval(selector, (e) => Number(e.value));
      await page.mouse.move(
        rect.x + rect.width * 0.4,
        rect.y + rect.height / 2,
        { steps: 12 },
      );
      await page.mouse.up();
      const after = await page.$eval(selector, (e) => Number(e.value));
      await page.keyboard.press("ArrowRight");
      check(
        "VE04 pointer gesture and keyboard remain continuous",
        during > after &&
          after > 15 &&
          (await page.$eval(
            selector,
            (e, after) => e === window.uatZoom && Number(e.value) === after + 5,
            after,
          )),
      );
      await page.$eval("#timelineViewport", (e) => {
        e.scrollLeft = 30;
      });
      const scroll = await page.$eval("#timelineViewport", (e) => e.scrollLeft);
      await page.keyboard.press("ArrowRight");
      check(
        "VE04 zoom retains scroll, selection and playhead",
        (await page.$eval("#timelineViewport", (e) => e.scrollLeft)) ===
          scroll &&
          (await state()).selectedItemId === selected &&
          (await state()).playhead === time,
      );
    });
    await fresh("VE05", async () => {
      await click("#step-export");
      await page.select('[data-control="quality"]', "high");
      await openDetails("Technical settings");
      await field('[data-control="fps"]', 24);
      probe(await renderDownload(), 24, true);
      await page.evaluate(() => {
        window.uatOldDownload = document.getElementById("downloadButton");
      });
      await openDetails("Technical settings");
      await field('[data-control="fps"]', 25);
      check(
        "VE05 changed FPS removes stale ready result and Download",
        await page.evaluate(
          () =>
            !document.getElementById("downloadButton") &&
            !document.querySelector(".export-results") &&
            !document
              .getElementById("contextPanel")
              .textContent.includes("Export complete") &&
            UsefulToolVideoEditor.results.length === 0,
        ),
      );
      check(
        "VE05 preview returns to editing canvas",
        await page.evaluate(
          () =>
            document.getElementById("outputVideo").hidden &&
            !document.getElementById("outputVideo").getAttribute("src") &&
            !document.getElementById("previewCanvas").hidden,
        ),
      );
      await page.evaluate(() => {
        window.uatUnexpectedDownload = false;
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          window.uatUnexpectedDownload = true;
          return click.call(this);
        };
        window.uatOldDownload.click();
      });
      check(
        "VE05 even a retained old button cannot download stale bytes",
        !(await page.evaluate(() => window.uatUnexpectedDownload)),
      );
      probe(await renderDownload(), 25, true);
      await page.evaluate(() => window.uatOldDownload.click());
      check(
        "VE05 retained old callback also preserves a newer valid export",
        await page.evaluate(
          () =>
            UsefulToolVideoEditor.results.length === 1 &&
            !!document.getElementById("downloadButton"),
        ),
      );
      for (const setting of ["bitrate", "format", "includeAudio", "content"]) {
        await openDetails("Technical settings");
        let sound = setting !== "includeAudio" && setting !== "content";
        if (setting === "bitrate") {
          await page.evaluate(() => {
            window.uatEncoderSettings = [];
            const configure = VideoEncoder.prototype.configure;
            VideoEncoder.prototype.configure = function (settings) {
              window.uatEncoderSettings.push({ ...settings });
              return configure.call(this, settings);
            };
          });
          await field('[data-control="bitrate"]', 2, "Enter");
          check(
            "VE05 numeric export edit keeps keyboard focus",
            await page.$eval(
              '[data-control="bitrate"]',
              (e) => e === document.activeElement,
            ),
          );
        } else if (setting === "format") {
          const alternate = await page.$eval(
            '[data-control="format"]',
            (e) => [...e.options].find((o) => o.value !== e.value)?.value,
          );
          check("VE05 alternate container available", !!alternate);
          await page.select('[data-control="format"]', alternate);
        } else if (setting === "includeAudio")
          await click('[data-control="includeAudio"]');
        else {
          await click("#step-effects");
          await select("video");
          await openDetails("Position and size");
          await field('[data-control="positionX"]', 80);
          await click("#step-export");
        }
        check(
          "VE05 invalidates every changed output " + setting,
          await page.evaluate(
            () =>
              !document.querySelector(".export-results") &&
              !document.getElementById("exportMessage") &&
              UsefulToolVideoEditor.results.length === 0,
          ),
        );
        const file = await renderDownload(),
          data = probe(file, 25, sound);
        if (setting === "bitrate")
          check(
            "VE05 new file uses the current target bitrate",
            await page.evaluate(() =>
              window.uatEncoderSettings.some(
                (c) => c.bitrate === 2000000 && c.framerate === 25,
              ),
            ),
            await page.evaluate(() => window.uatEncoderSettings),
          );
        if (setting === "format")
          check(
            "VE05 downloaded container matches chosen format",
            file.endsWith(
              "." +
                (await page.evaluate(
                  () => UsefulToolVideoEditor.results[0].extension,
                )),
            ) &&
              data.streams.find((s) => s.codec_type === "video").codec_name ===
                (await page.evaluate(() =>
                  UsefulToolVideoEditor.project.exportSettings.format.includes(
                    "vp8",
                  )
                    ? "vp8"
                    : UsefulToolVideoEditor.project.exportSettings.format.includes(
                          "vp9",
                        )
                      ? "vp9"
                      : "h264",
                )),
          );
        if (setting === "content") {
          const pixels = execFileSync(
            "ffmpeg",
            [
              "-v",
              "error",
              "-i",
              file,
              "-frames:v",
              "1",
              "-vf",
              "crop=40:360:0:0,scale=1:1",
              "-f",
              "rawvideo",
              "-pix_fmt",
              "rgb24",
              "-",
            ],
            { maxBuffer: 10000 },
          );
          check(
            "VE05 downloaded pixels reflect latest X position",
            [...pixels].every((p) => p < 12),
            [...pixels],
          );
        }
      }
      await openDetails("Interval cuts and ZIP export");
      await field('[data-control="segmentInterval"]', 2);
      await click("#exportSegmentsButton");
      await page.waitForFunction(
        () =>
          !UsefulToolVideoEditor.exporting &&
          UsefulToolVideoEditor.results.length,
        { timeout: 120000 },
      );
      const zip = await downloaded(() => click("#downloadButton"), ".zip"),
        folder = path.join(downloads, "segments");
      fs.mkdirSync(folder, { recursive: true });
      execFileSync("python3", [
        "-c",
        "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])",
        zip,
        folder,
      ]);
      const segments = fs.readdirSync(folder).sort();
      check(
        "VE05 actual ZIP contains all three numbered segments",
        segments.length === 3 &&
          segments.every((name, i) =>
            name.includes(String(i + 1).padStart(4, "0")),
          ),
        segments,
      );
      for (const name of segments) probe(path.join(folder, name), 25, false, 2);
      await openDetails("Technical settings");
      await field('[data-control="fps"]', 30);
      check(
        "VE05 ZIP result is invalidated too",
        !(await page.$("#downloadButton")),
      );
      await click("#exportButton");
      await page.waitForSelector("#cancelButton");
      await click("#cancelButton");
      await page.waitForFunction(() => !UsefulToolVideoEditor.exporting);
      check(
        "VE05 cancellation offers no incomplete file",
        !(await page.$("#downloadButton")) &&
          (await page.$eval("#contextPanel", (e) => e.textContent)).includes(
            "cancelled",
          ),
      );
      probe(await renderDownload(), 30, false);
    });
    await fresh("VE06", async () => {
      for (const commit of ["Enter", "Tab", "click"]) {
        await openDetails("Position and size");
        await field('[data-control="width"]', 0, commit);
        const value = (await state()).items[0].transform.width,
          shown = await page.$eval('[data-control="width"]', (e) =>
            Number(e.value),
          );
        check(
          "VE06 clamped width matches committed input " + commit,
          value === 1 && shown === value,
          { value, shown },
        );
      }
      for (const [value, expected] of [
        [-5, 1],
        [100001, 100000],
        [123.456, 123.456],
        ["", 123.456],
        ["-", 123.456],
        ["Infinity", 123.456],
      ]) {
        await field('[data-control="width"]', value);
        const stored = (await state()).items[0].transform.width;
        check(
          "VE06 numeric edge " + JSON.stringify(value),
          stored === expected &&
            (await page.$eval('[data-control="width"]', (e) =>
              Number(e.value),
            )) === expected,
          stored,
        );
        await select("video");
        await openDetails("Position and size");
        check(
          "VE06 reselection retains exact accepted value " +
            JSON.stringify(value),
          (await page.$eval('[data-control="width"]', (e) =>
            Number(e.value),
          )) === expected,
        );
      }
      await click('[data-control="positionX"]');
      await page.keyboard.down("Control");
      await page.keyboard.press("a");
      await page.keyboard.up("Control");
      await page.keyboard.type("-");
      check(
        "VE06 partial negative input keeps focus",
        await page.$eval(
          '[data-control="positionX"]',
          (e) => e === document.activeElement,
        ),
      );
      await page.keyboard.type("12.5");
      await page.keyboard.press("Enter");
      check(
        "VE06 completed negative decimal reaches model",
        (await state()).items[0].transform.x === -12.5,
      );
      await recovered();
      check(
        "VE06 normalized and decimal values survive recovery",
        (await state()).items[0].transform.x === -12.5 &&
          (await state()).items[0].transform.width === 123.456,
      );
    });
    await fresh("VE06-fields", async () => {
      const original = await state();
      const coverage = [];
      for (const kind of ["video", "audio", "text", "credits", "export"]) {
        await page.evaluate(
          async ({ original, kind }) => {
            const app = UsefulToolVideoEditor;
            await app.replaceProject(app.Model.copy(original));
            if (["text", "credits"].includes(kind)) app.addNewItem(kind);
            else if (kind === "export") app.setStep("export");
            else {
              app.selectItem(app.project.items.find((i) => i.kind === kind).id);
              if (kind === "video") {
                app.Model.addEffect(app.selectedItem, "brightness");
                app.Model.setKey(app.selectedItem, 1, 0.6);
                app.renderAll();
              }
            }
          },
          { original, kind },
        );
        const base = await state();
        const controls = await page.$$eval(
          '#contextPanel .field input[type="number"]',
          (inputs) =>
            inputs.map((e) => ({
              id: e.dataset.control,
              min: e.min ? Number(e.min) : 0,
              max: e.max ? Number(e.max) : 20,
            })),
        );
        for (const control of controls) {
          const selector =
            '#contextPanel .field input[data-control="' + control.id + '"]';
          const trials = [
            control.min - 1,
            control.max + 1,
            "",
            -1,
            1.234,
            "Infinity",
            "1e999",
          ];
          for (const [n, value] of trials.entries()) {
            await page.evaluate(
              (base) =>
                UsefulToolVideoEditor.replaceProject(
                  UsefulToolVideoEditor.Model.copy(base),
                ),
              base,
            );
            await reveal(selector);
            await field(selector, value, ["Tab", "Enter", "click"][n % 3]);
            const accepted = await page.$eval(selector, (e) => Number(e.value));
            const p = await state();
            assert.doesNotThrow(
              () => M.parseProject(M.serialize(p)),
              kind + ":" + control.id + " persisted invalid state",
            );
            // Read the value from freshly resolved model bindings, rather than
            // treating the field's own cached text as proof of a committed edit.
            await page.evaluate(() => UsefulToolVideoEditor.renderAll());
            const reselected = await page.$eval(selector, (e) =>
              Number(e.value),
            );
            assert.ok(
              Number.isFinite(accepted) &&
                Math.abs(accepted - reselected) < 1e-7,
              kind +
                ":" +
                control.id +
                " input " +
                value +
                " displayed " +
                accepted +
                " but restored " +
                reselected,
            );
          }
          coverage.push(kind + ":" + control.id);
          check(
            "VE06 generic numeric bounds/drafts/commit/reselection " +
              kind +
              ":" +
              control.id,
            true,
          );
        }
      }
      fs.writeFileSync(
        path.join(reports, "numeric-field-coverage.json"),
        JSON.stringify(coverage, null, 2),
      );
    });
    await fresh("VE06-transition", async () => {
      await page.evaluate(() => {
        const app = UsefulToolVideoEditor;
        app.edit(
          () => app.Model.addMedia(app.project, app.project.assets[0].id),
          "Add second clip",
          { context: true },
        );
      });
      for (const value of [-1, 10, "", 1.234, "Infinity", "1e999"]) {
        await click('#timelineContent button[data-help-id="transition"]');
        await field(
          '#studioDialog [data-control="transitionDuration"]',
          value,
          "Enter",
        );
        const accepted = await page.$eval(
          '#studioDialog [data-control="transitionDuration"]',
          (e) => Number(e.value),
        );
        await click('#studioDialog button[data-help-id="apply"]');
        check(
          "VE06 transition accepted timing matches committed model " + value,
          Math.abs((await state()).transitions[0].duration - accepted) < 1e-7,
        );
      }
      await click('#timelineContent button[data-help-id="transition"]');
      await click('#studioDialog button[data-help-id="useMaximum"]');
      const maximum = await page.$eval(
        '#studioDialog [data-control="transitionDuration"]',
        (e) => Number(e.value),
      );
      await page.select('#studioDialog [data-control="easing"]', "linear");
      check(
        "VE06 changing another field preserves Use maximum feedback",
        (await page.$eval(
          '#studioDialog [data-control="transitionDuration"]',
          (e) => Number(e.value),
        )) === maximum,
      );
      await click('#studioDialog button[data-help-id="apply"]');
      check(
        "VE06 Use maximum reaches transition model",
        (await state()).transitions[0].duration === maximum,
      );
    });
    check("No uncaught browser exceptions", errors.length === 0, errors);
  } finally {
    const version = browser ? await browser.version() : null;
    if (browser) {
      const rows = execFileSync("ps", ["-eo", "pid=,ppid="], {
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .map((row) => row.trim().split(/\s+/).map(Number));
      for (let n = 0; n < 10; n++)
        for (const [pid, parent] of rows) if (owned.has(parent)) owned.add(pid);
      await browser.close().catch(() => {});
    }
    for (const pid of owned) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    server.close();
    fs.writeFileSync(
      path.join(reports, "report.json"),
      JSON.stringify(
        { version, checks, errors, closedProcesses: [...owned] },
        null,
        2,
      ),
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
