// Independent ZIP/FFmpeg checks of the actual browser-produced artifacts.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
const reports = path.resolve(__dirname, "../../build/reports/video-studio");
const checks = [],
  metrics = {};
function check(name, passed, detail) {
  checks.push({ name, passed: !!passed, detail });
  console.log((passed ? "PASS " : "FAIL ") + name);
  if (!passed) throw new Error(name + ": " + JSON.stringify(detail));
}
const tone = (data, hz, channel, start = 0.2, duration = 0.5) => {
  const first = Math.round(start * 48000),
    end = Math.min(data.length / 8, first + Math.round(duration * 48000));
  let sin = 0,
    cos = 0;
  for (let n = first; n < end; n++) {
    const sample = data.readFloatLE(n * 8 + channel * 4);
    sin += sample * Math.sin((2 * Math.PI * hz * n) / 48000);
    cos += sample * Math.cos((2 * Math.PI * hz * n) / 48000);
  }
  return (Math.hypot(sin, cos) * 2) / (end - first);
};
function audio(file) {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-map",
      "0:a:0",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { maxBuffer: 5e6 },
  );
}
(async () => {
  let directory;
  try {
    const stereo = path.join(reports, "routing-stereo.webm"),
      samples = audio(stereo);
    metrics.tones = [0, 1].map((ch) =>
      [440, 880].map((hz) => tone(samples, hz, ch)),
    );
    check(
      "FFmpeg confirms different songs in the final Left and Right Opus channels",
      metrics.tones[0][0] > 0.1 &&
        metrics.tones[0][1] < 0.003 &&
        metrics.tones[1][1] > 0.1 &&
        metrics.tones[1][0] < 0.003,
      metrics.tones,
    );
    const fade = path.join(reports, "routing-fade.webm");
    for (const [time, expected] of [
      [3, [254, 0, 0]],
      [3.5, [64, 0, 127]],
      [4, [0, 0, 254]],
    ]) {
      const rgb = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        fade,
        "-ss",
        String(time),
        "-frames:v",
        "1",
        "-vf",
        "crop=2:2:96:54",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
      ]);
      const pixel = [...rgb.subarray(0, 3)];
      check(
        "independent decoded frame at " +
          time +
          "s preserves the connected fade",
        pixel.every((n, i) => Math.abs(n - expected[i]) < 8),
        pixel,
      );
    }
    const archive = path.join(reports, "routing-segments.zip");
    const names = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
      .trim()
      .split("\n");
    check(
      "106-second / 0.1-second ZIP contains exactly 1060 ordered WebM entries",
      names.length === 1060 &&
        names.every(
          (name, i) =>
            name ===
            "Routing UAT-segment-" + String(i + 1).padStart(4, "0") + ".webm",
        ),
    );
    check(
      "independent unzip validates all 1060 segment CRCs and ZIP structure",
      execFileSync("unzip", ["-tqq", archive], { encoding: "utf8" }) === "",
    );
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "utv-real-segments-"));
    execFileSync("unzip", ["-q", archive, "-d", directory]);
    let index = 0,
      totalFrames = 0;
    const failures = [];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (index < names.length) {
          const at = index++,
            file = path.join(directory, names[at]);
          const { stdout } = await run("ffprobe", [
            "-v",
            "error",
            "-count_frames",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            file,
          ]);
          const metadata = JSON.parse(stdout),
            v = metadata.streams.find((s) => s.codec_type === "video"),
            a = metadata.streams.find((s) => s.codec_type === "audio");
          totalFrames += Number(v?.nb_read_frames || 0);
          if (
            !(
              v?.codec_name === "vp9" &&
              v.width === 192 &&
              v.height === 108 &&
              Number(v.nb_read_frames) === 3 &&
              a?.codec_name === "opus" &&
              a.channels === 2 &&
              a.sample_rate === "48000" &&
              Number(metadata.format.duration) >= 0.1 &&
              Number(metadata.format.duration) <= 0.125
            )
          )
            failures.push({ name: names[at], metadata });
          if ((at + 1) % 200 === 0)
            console.log("Verified " + (at + 1) + " segment containers");
        }
      }),
    );
    metrics.totalFrames = totalFrames;
    check(
      "every ZIP entry decodes as three 30 fps VP9 frames with stereo 48 kHz Opus",
      failures.length === 0 && totalFrames === 3180,
      failures.slice(0, 3),
    );
    for (const at of [0, 529, 1058, 1059]) {
      const pcm = audio(path.join(directory, names[at]));
      const spectrum = [0, 1].map((ch) =>
        [440, 880].map((hz) => tone(pcm, hz, ch, 0.025, 0.05)),
      );
      const ratio = (main, other) => main > 0.0005 && main > other * 10;
      check(
        "segment " +
          (at + 1) +
          " retains song routing across repeated source and final fades",
        ratio(spectrum[0][0], spectrum[0][1]) &&
          ratio(spectrum[1][1], spectrum[1][0]),
        spectrum,
      );
    }
    fs.writeFileSync(
      path.join(reports, "routing-export-verification.json"),
      JSON.stringify({ passed: true, checks, metrics }, null, 2),
    );
  } catch (error) {
    fs.writeFileSync(
      path.join(reports, "routing-export-verification.json"),
      JSON.stringify(
        { passed: false, checks, metrics, error: error.stack },
        null,
        2,
      ),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
})();
