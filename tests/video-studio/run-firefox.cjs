// Run the existing video-browser suites in the downloaded stock Firefox.
const { launch } = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const reports = path.join(
  root,
  "build/reports/video-studio/firefox-regressions",
);
fs.mkdirSync(reports, { recursive: true });
const server = https.createServer(
  require("../../scripts/test-tls.cjs")(root),
  (req, res) => {
    if (require("../../scripts/test-artifacts.cjs")(root, req, res)) return;
    const file = path.resolve(
      root,
      "." + new URL(req.url, "https://localhost").pathname,
    );
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    )
      return res.writeHead(404).end();
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".mp4": "video/mp4",
          ".mp3": "audio/mpeg",
          ".json": "application/json",
        }[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  },
);
const suites = process.argv.slice(2);
if (!suites.length)
  suites.push(
    "core",
    "render",
    "ui",
    "advanced",
    "controls",
    "gestures",
    "regressions",
    "offline",
  );
let browser;
const owned = new Set(),
  results = [];
(async () => {
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    browser = await launch({
      browser: "firefox",
      executablePath:
        process.env.FIREFOX_BINARY ||
        path.join(os.homedir(), "UAT-firefox/firefox/firefox"),
      headless: true,
      acceptInsecureCerts: true,
      defaultViewport: { width: 1440, height: 1080 },
      extraPrefsFirefox: { "media.autoplay.default": 0 },
      protocolTimeout: 300000,
    });
    owned.add(browser.process().pid);
    for (const name of suites) {
      const context = await browser.createBrowserContext(),
        page = await context.newPage();
      let result;
      try {
        await page.goto(
          "https://127.0.0.1:" +
            server.address().port +
            "/tests/video-studio/" +
            name +
            ".html",
        );
        const deadline =
          Date.now() + (name === "long-playback" ? 600000 : 240000);
        while (Date.now() < deadline) {
          const state = await page.evaluate(() => ({
            done: window.TEST_RESULT,
            request: window.UAT_REQUEST,
          }));
          if (state.done) {
            result = state.done;
            break;
          }
          if (state.request) {
            await page.evaluate(() => {
              window.UAT_REQUEST = null;
            });
            try {
              const frame = await (await page.$("#studio")).contentFrame();
              await frame.locator(state.request.selector).click();
              await page.evaluate((id) => {
                window.UAT_RESPONSE = { id };
              }, state.request.id);
            } catch (error) {
              await page.evaluate(
                (value) => {
                  window.UAT_RESPONSE = value;
                },
                { id: state.request.id, error: error.message },
              );
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!result)
          throw new Error("Suite did not finish before its deadline");
      } catch (error) {
        result = { passed: false, error: error.stack };
      }
      await page
        .screenshot({ path: path.join(reports, name + ".png"), fullPage: true })
        .catch(() => {});
      fs.writeFileSync(
        path.join(reports, name + ".json"),
        JSON.stringify(result, null, 2),
      );
      results.push({
        name,
        passed: result.passed,
        checks: result.checks?.length,
        error: result.error,
        failed: result.checks?.filter((check) => !check.passed),
      });
      console.log(JSON.stringify(results.at(-1)));
      if (!result.passed) process.exitCode = 1;
      await context.close();
    }
  } finally {
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
      path.join(reports, "summary.json"),
      JSON.stringify(results, null, 2),
    );
    console.log("Closed owned Firefox processes:", [...owned].join(", "));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
