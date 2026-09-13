# Local media fixtures

These tiny fixtures were generated with FFmpeg for the Video Studio tests. They contain no external or copyrighted media. `source.mp4` is a 160 × 90 test pattern with a 440 Hz sine wave, and `music.mp3` is a 660 Hz sine wave. Both are 1.2 seconds long.

```sh
ffmpeg -f lavfi -i testsrc2=size=160x90:rate=30:duration=1.2 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=1.2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest source.mp4
ffmpeg -f lavfi -i sine=frequency=660:sample_rate=48000:duration=1.2 -c:a libmp3lame music.mp3
```
