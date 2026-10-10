// Generated locally; the 90-second fixture is intentionally not checked into Git.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const directory = path.resolve(
  __dirname,
  "../../build/reports/video-studio/long-fixtures",
);
fs.mkdirSync(directory, { recursive: true });
const video = path.join(directory, "timecode-90s.mp4");
const music = path.join(directory, "repeat-7s.mp3");
if (!fs.existsSync(video))
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1280x720:rate=30:duration=90",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=90",
    "-vf",
    "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf:timecode='00\\:00\\:00\\:00':r=30:fontsize=60:fontcolor=white:box=1:boxcolor=black:x=40:y=40",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    "2280k",
    "-minrate",
    "2280k",
    "-maxrate",
    "2280k",
    "-bufsize",
    "4560k",
    "-x264-params",
    "nal-hrd=cbr:force-cfr=1",
    "-g",
    "60",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-movflags",
    "+faststart",
    video,
  ]);
if (!fs.existsSync(music))
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=48000:duration=7",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    music,
  ]);
const metadata = JSON.parse(
  execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=codec_name,width,height,r_frame_rate",
      "-of",
      "json",
      video,
    ],
    { encoding: "utf8" },
  ),
);
if (
  !metadata.streams.some(
    (s) =>
      s.codec_name === "h264" &&
      s.width === 1280 &&
      s.height === 720 &&
      s.r_frame_rate === "30/1",
  ) ||
  !metadata.streams.some((s) => s.codec_name === "aac") ||
  Math.abs(Number(metadata.format.duration) - 90) > 0.05
)
  throw new Error(
    "The long-playback fixture must be a 90-second, 720p30 H.264/AAC video.",
  );
fs.writeFileSync(
  path.join(directory, "manifest.json"),
  JSON.stringify(
    {
      video: {
        ...metadata,
        sha256: createHash("sha256")
          .update(fs.readFileSync(video))
          .digest("hex"),
      },
      music: {
        bytes: fs.statSync(music).size,
        sha256: createHash("sha256")
          .update(fs.readFileSync(music))
          .digest("hex"),
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Long-playback fixture:",
  fs.statSync(video).size,
  "bytes; 90s H.264/AAC, 1280 × 720, 30 fps.",
);
