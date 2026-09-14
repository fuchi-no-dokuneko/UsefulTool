const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
require("./create-long-fixtures.cjs");
const root = path.resolve(__dirname, "../../build/reports/video-studio"),
  directory = path.join(root, "release-fixtures");
fs.mkdirSync(directory, { recursive: true });
for (const [index, name] of ["uat-x.mp4", "uat-y.mp4", "uat-z.mp4"].entries()) {
  const file = path.join(directory, name);
  if (!fs.existsSync(file))
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=30:duration=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=" + (440 + index * 110) + ":sample_rate=48000:duration=4",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      file,
    ]);
}
fs.copyFileSync(
  path.join(root, "long-fixtures/timecode-90s.mp4"),
  path.join(directory, "timecode-90s.mp4"),
);
fs.copyFileSync(
  path.join(root, "long-fixtures/repeat-7s.mp3"),
  path.join(directory, "music-7s.mp3"),
);
for (const [duration, frequency] of [
  [5, 770],
  [4, 880],
]) {
  const file = path.join(directory, "music-" + duration + "s.mp3");
  if (!fs.existsSync(file))
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=" + frequency + ":sample_rate=48000:duration=" + duration,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      file,
    ]);
}
for (const extension of ["jpg", "jpeg", "bmp", "gif", "webp", "png"]) {
  const name = extension === "png" ? "transparent.png" : "picture." + extension;
  const source =
    extension === "png"
      ? "testsrc2=size=320x180,format=rgba,colorchannelmixer=aa=0.5"
      : "testsrc2=size=640x360";
  if (!fs.existsSync(path.join(directory, name)))
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      source,
      "-frames:v",
      "1",
      "-threads",
      "1",
      path.join(directory, name),
    ]);
}
const files = fs.readdirSync(directory);
if (files.length !== 13)
  throw new Error("Expected thirteen release UAT fixtures.");
console.log("Release fixture library:", files.join(", "));
