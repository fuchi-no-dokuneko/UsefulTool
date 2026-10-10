// Verify the completed file with an independent decoder, not UI progress or encoder counters.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto");
const reports = path.resolve(__dirname, "../../build/reports/video-studio"),
  file = path.join(reports, "release-standard.webm");
const browser = JSON.parse(
  fs.readFileSync(path.join(reports, "release.json"), "utf8"),
);
const checks = [],
  check = (name, passed, detail) => {
    checks.push({ name, passed: Boolean(passed), detail });
  };
const probe = (args) =>
  JSON.parse(
    execFileSync("ffprobe", ["-v", "error", ...args, "-of", "json", file], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
const metadata = probe([
  "-count_frames",
  "-show_entries",
  "stream=codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,sample_rate,channels,start_time:format=duration,size",
]);
const video = metadata.streams.find((s) => s.codec_type === "video"),
  audio = metadata.streams.find((s) => s.codec_type === "audio");
check(
  "FFprobe independently counts exactly 3150 VP9 frames at 1920x1080 and 30fps",
  video?.codec_name === "vp9" &&
    video.width === 1920 &&
    video.height === 1080 &&
    video.nb_read_frames === "3150" &&
    video.r_frame_rate === "30/1" &&
    video.avg_frame_rate === "30/1",
  video,
);
check(
  "Opus output contains two 48kHz channels and synchronized 105-second duration",
  audio?.codec_name === "opus" &&
    audio.channels === 2 &&
    audio.sample_rate === "48000" &&
    Math.abs(Number(metadata.format.duration) - 105) < 1 / 30,
  metadata.format,
);
const frames = probe([
  "-select_streams",
  "v:0",
  "-show_frames",
  "-show_entries",
  "frame=best_effort_timestamp_time,pkt_duration_time",
]).frames;
const times = frames.map((f) => Number(f.best_effort_timestamp_time)),
  intervals = times.slice(1).map((t, i) => t - times[i]);
const audioFrames = probe([
  "-select_streams", "a:0", "-show_frames", "-show_entries",
  "frame=best_effort_timestamp_time,pkt_duration_time,nb_samples",
]).frames;
const videoEnd = times.at(-1) + Number(frames.at(-1).pkt_duration_time || 1 / 30),
  audioLast = audioFrames.at(-1),
  audioEnd = Number(audioLast.best_effort_timestamp_time) + Number(audioLast.nb_samples) / 48000;
check(
  "independently decoded audio and video end within one 30fps frame",
  Math.abs(audioEnd - videoEnd) <= 1 / 30 && Math.abs(audioEnd - 105) <= 1 / 30,
  { videoEnd, audioEnd, differenceMs: Math.abs(audioEnd - videoEnd) * 1000 },
);
const maxClockError = Math.max(...times.map((t, i) => Math.abs(t - i / 30)));
check(
  "every encoded frame is on the fixed 1/30-second project clock",
  times.length === 3150 &&
    maxClockError < 0.0011 &&
    intervals.every((t) => t >= 0.032 && t <= 0.035),
  {
    maxClockError,
    minimumInterval: Math.min(...intervals),
    maximumInterval: Math.max(...intervals),
  },
);
const hashText = execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-ss",
    "12",
    "-i",
    file,
    "-t",
    "85",
    "-an",
    "-vf",
    "scale=64:36",
    "-f",
    "framemd5",
    "-",
  ],
  { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
);
const hashes = hashText
  .split("\n")
  .filter((s) => s && !s.startsWith("#"))
  .map((s) => s.split(",").at(-1).trim());
let repeated = 1,
  maxRepeat = 1,
  changed = 0;
for (let i = 1; i < hashes.length; i++) {
  if (hashes[i] === hashes[i - 1]) repeated++;
  else {
    repeated = 1;
    changed++;
  }
  maxRepeat = Math.max(maxRepeat, repeated);
}
check(
  "the long-video portion contains changing decoded pictures rather than repeated slideshow frames",
  hashes.length >= 2549 &&
    changed / (hashes.length - 1) > 0.9 &&
    maxRepeat <= 3,
  { decodedFrames: hashes.length, changed, maxRepeat },
);
const references = browser.references || [],
  pixelErrors = [];
for (const reference of references) {
  const expected = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      "pipe:0",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    {
      input: Buffer.from(reference.png.split(",")[1], "base64"),
      maxBuffer: 1024 * 1024,
    },
  );
  const actual = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(reference.time),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=256:144:flags=bilinear",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  let error = 0;
  if (actual.length === expected.length)
    for (let i = 0; i < actual.length; i++)
      error += Math.abs(actual[i] - expected[i]);
  pixelErrors.push({
    frame: reference.frame,
    time: reference.time,
    meanError:
      actual.length === expected.length
        ? error / actual.length / 255
        : Infinity,
  });
}
check(
  "decoded frames match the compositor at transition overlay blur and credits times",
  references.length === 8 && pixelErrors.every((p) => p.meanError < 0.04),
  pixelErrors,
);
// The final still-image section has only the repeating 1.5x music. Its tone must
// remain 660Hz, instead of shifting to 990Hz or falling silent after a repeat.
const raw = execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-i",
    file,
    "-vn",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-f",
    "f32le",
    "pipe:1",
  ],
  { maxBuffer: 64 * 1024 * 1024 },
);
const pcm = new Float32Array(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
);
const power = (seconds, hz, channel = 0) => {
  const start = Math.round(seconds * 48000),
    count = 4800;
  let re = 0,
    im = 0;
  for (let i = 0; i < count; i++) {
    const sample = pcm[(start + i) * 2 + channel] || 0,
      angle = (2 * Math.PI * hz * i) / 48000;
    re += sample * Math.cos(angle);
    im += sample * Math.sin(angle);
  }
  return (re * re + im * im) / (count * count);
};
const tones = [102, 103, 104, 104.5].map((time) => ({
  time,
  left: power(time, 660),
  right: power(time, 660, 1),
  shifted: power(time, 990),
}));
check(
  "decoded repeating 1.5x MP3 stays audible in stereo with preserved 660Hz pitch",
  tones.every(
    (t) => t.left > 0.00001 && t.right > 0.00001 && t.left > t.shifted * 10,
  ),
  tones,
);
check(
  "browser behavioral gates and actual file download passed",
  browser.passed,
  { checks: browser.checks.length, metrics: browser.metrics },
);
const result = {
  passed: checks.every((c) => c.passed),
  checks,
  metadata,
  sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  bytes: fs.statSync(file).size,
};
fs.writeFileSync(
  path.join(reports, "release-export-verification.json"),
  JSON.stringify(result, null, 2) + "\n",
);
for (const c of checks)
  console.log(
    (c.passed ? "PASS " : "FAIL ") +
      c.name +
      (c.passed ? "" : " " + JSON.stringify(c.detail)),
  );
assert.ok(
  result.passed,
  "Release export gate is HOLD. Inspect release-export-verification.json.",
);
