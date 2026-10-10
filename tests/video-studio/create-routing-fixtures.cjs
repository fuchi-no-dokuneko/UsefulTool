const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const destination = path.resolve(
  __dirname,
  "../../build/reports/video-studio/routing-fixtures",
);
fs.mkdirSync(destination, { recursive: true });
function generate(name, args) {
  const file = path.join(destination, name);
  if (!fs.existsSync(file))
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      ...args,
      file,
    ]);
}
for (const [name, expression] of [
  ["song-left.mp3", "0|0.3*sin(2*PI*440*t)"],
  ["song-right.mp3", "0.3*sin(2*PI*880*t)|0"],
  ["dual.mp3", "0.3*sin(2*PI*440*t)|0.2*sin(2*PI*880*t)"],
])
  generate(name, [
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=" + expression + ":s=48000:d=8",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
  ]);
for (const [name, color, tone] of [
  ["clip-a.mp4", "red", 300],
  ["clip-b.mp4", "blue", 600],
])
  generate(name, [
    "-f",
    "lavfi",
    "-i",
    "color=" + color + ":s=192x108:r=30:d=4",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=" + tone + ":sample_rate=48000:duration=4",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
  ]);
generate("long.mp4", [
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=192x108:rate=30:duration=106",
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-crf",
  "23",
  "-g",
  "30",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
]);
