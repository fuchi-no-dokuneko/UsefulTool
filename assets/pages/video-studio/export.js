/* Project-time export: every composed frame gets an explicit timestamp. */
(function (root) {
  "use strict";
  const { Model: M, Media, Audio, Renderer } = root.UTStudio;
  const C = root.UTVideoCodecs;
  const SAMPLE_RATE = 48000;
  const FORMATS = [
    ["video/webm;codecs=vp9,opus", "WebM · VP9 + Opus", "webm", "vp9", "opus"],
    ["video/webm;codecs=vp8,opus", "WebM · VP8 + Opus", "webm", "vp8", "opus"],
    [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "MP4 · H.264 + AAC",
      "mp4",
      "avc",
      "aac",
    ],
  ];
  let supported = [];
  const yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0));
  function cancelled(signal) {
    if (signal?.aborted)
      throw new DOMException("Export cancelled.", "AbortError");
  }
  async function loadFormats() {
    if (!C || !root.VideoEncoder || !root.AudioEncoder) return [];
    const results = await Promise.all(
      FORMATS.map(async (format) => {
        try {
          const [video, audio] = await Promise.all([
            C.canEncodeVideo(format[3], {
              width: 1920,
              height: 1080,
              latencyMode: "quality",
            }),
            C.canEncodeAudio(format[4], {
              numberOfChannels: 2,
              sampleRate: SAMPLE_RATE,
            }),
          ]);
          return video && audio ? format : null;
        } catch {
          return null;
        }
      }),
    );
    supported = results.filter(Boolean);
    return supported;
  }

  class Sources {
    constructor(project, library, start, end, signal, cache) {
      Object.assign(this, { project, library, start, end, signal });
      this.inputs = new Map();
      this.readers = new Map();
      this.frames = new Map();
      this.sharedCache = cache;
      this.pcm = cache?.pcm || new Map();
      this.stretched = cache?.stretched || new Map();
      this.fallbacks = new Map();
      this.renderLibrary = {
        assets: library.assets,
        element: (value) => this.frames.get(value.id),
      };
    }
    input(assetId) {
      if (!this.inputs.has(assetId)) {
        const runtime = this.library.assets.get(assetId);
        if (!runtime) throw new Error("Relink media before exporting.");
        this.inputs.set(
          assetId,
          new C.Input({
            formats: C.ALL_FORMATS,
            source: new C.BlobSource(runtime.file),
          }),
        );
      }
      return this.inputs.get(assetId);
    }
    async video(value, time, index) {
      let reader = this.readers.get(value.id);
      if (!reader && !this.fallbacks.has(value.id)) {
        try {
          const track = await this.input(value.assetId).getPrimaryVideoTrack();
          if (!track || !(await track.canDecode()))
            throw new Error("Use the browser decoder.");
          const config = await track.getDecoderConfig();
          if (
            !["primaries", "matrix", "transfer", "fullRange"].every(
              (key) => config.colorSpace?.[key] != null,
            )
          ) {
            // Untagged SD footage is often rendered as BT.601 by the preview,
            // while the codec library supplies BT.709 defaults. Use the native
            // decoder's resolved metadata instead of guessing a color matrix.
            const frame = new VideoFrame(
              this.library.assets.get(value.assetId).probe,
            );
            let colorSpace;
            try {
              colorSpace = frame.colorSpace.toJSON();
            } finally {
              frame.close();
            }
            if (
              !["primaries", "matrix", "transfer", "fullRange"].every(
                (key) => colorSpace[key] != null,
              )
            )
              throw new Error("Use the browser's color conversion.");
            track.getDecoderConfig = async () => ({ ...config, colorSpace });
          }
          const source = M.asset(this.project, value.assetId);
          const sink = new C.CanvasSink(track, {
            width: source.width,
            height: source.height,
            fit: "fill",
            poolSize: 2,
            alpha: true,
          });
          const fps = this.project.exportSettings.fps,
            start = this.start,
            end = Math.min(value.end, this.end);
          function* timestamps() {
            for (let frame = index; start + frame / fps < end - 1e-7; frame++)
              yield M.sourceTimeAt(value, start + frame / fps) + 1e-7;
          }
          reader = sink.canvasesAtTimestamps(timestamps());
          this.readers.set(value.id, reader);
        } catch {
          // Browser-decodable legacy inputs still use the same fixed output clock.
          const element = document.createElement("video");
          element.muted = true;
          element.playsInline = true;
          element.preload = "auto";
          element.src = this.library.assets.get(value.assetId).url;
          this.fallbacks.set(value.id, element);
        }
      }
      cancelled(this.signal);
      if (reader) {
        const result = await reader.next();
        cancelled(this.signal);
        if (!result.value)
          throw new Error(
            "A source video frame could not be decoded at " +
              time.toFixed(3) +
              " seconds.",
          );
        this.frames.set(value.id, result.value.canvas);
      } else {
        const element = this.fallbacks.get(value.id);
        await Media.seek(element, M.sourceTimeAt(value, time), this.signal);
        this.frames.set(value.id, element);
      }
    }
    async prepareFrame(time, index) {
      const plan = M.evaluateFrame(this.project, time);
      await Promise.all(
        plan.items
          .filter((entry) => entry.item.kind === "video")
          .map((entry) => this.video(entry.item, time, index)),
      );
      cancelled(this.signal);
    }
    async audio(assetId) {
      if (this.pcm.has(assetId)) return this.pcm.get(assetId);
      const operation = (async () => {
        const descriptor = M.asset(this.project, assetId),
          input = this.input(assetId);
        let track;
        try {
          track = await input.getPrimaryAudioTrack();
        } catch {
          /* Legacy browser decoder below. */
        }
        if (track === null) return null; // A silent video is a valid source.
        const context = new OfflineAudioContext(2, 1, SAMPLE_RATE);
        let buffer;
        try {
          buffer = await context.decodeAudioData(
            await this.library.assets.get(assetId).file.arrayBuffer(),
          );
        } catch (error) {
          throw new Error(
            "Could not decode the sound in " +
              descriptor.name +
              ": " +
              error.message,
          );
        }
        cancelled(this.signal);
        if (buffer.numberOfChannels > 2) {
          const downmix = new OfflineAudioContext(
            2,
            buffer.length,
            SAMPLE_RATE,
          );
          const source = downmix.createBufferSource();
          source.buffer = buffer;
          source.connect(downmix.destination);
          source.start();
          buffer = await downmix.startRendering();
        }
        return {
          left: buffer.getChannelData(0),
          right: buffer.getChannelData(
            Math.min(1, buffer.numberOfChannels - 1),
          ),
          sampleRate: buffer.sampleRate,
        };
      })();
      this.pcm.set(assetId, operation);
      return operation;
    }
    async stretch(value, pcm) {
      const key = [
        value.assetId,
        value.sourceIn,
        value.sourceOut,
        value.playbackRate,
      ].join(":");
      if (this.stretched.has(key)) return this.stretched.get(key);
      const operation = (async () => {
        const first = Math.round(value.sourceIn * SAMPLE_RATE),
          count = Math.round(M.sourceSpan(value) * SAMPLE_RATE),
          length = Math.max(1, Math.round(count / value.playbackRate));
        const soundTouch = new C.SoundTouch();
        soundTouch.stretch.setParameters(SAMPLE_RATE, 0, 0, 8);
        soundTouch.tempo = value.playbackRate;
        const source = {
          extract(target, frames, position) {
            for (let i = 0; i < frames; i++) {
              const at = first + position + i,
                inside = position + i < count;
              target[i * 2] = inside ? pcm.left[at] || 0 : 0;
              target[i * 2 + 1] = inside ? pcm.right[at] || 0 : 0;
            }
            return frames; // Zero padding flushes the tail; only exact-duration output is retained.
          },
        };
        const filter = new C.SimpleFilter(source, soundTouch),
          output = new Float32Array(length * 2),
          scratch = new Float32Array(8192);
        for (let offset = 0; offset < length; ) {
          cancelled(this.signal);
          const count = Math.min(4096, length - offset),
            read = filter.extract(scratch, count);
          if (!read)
            throw new Error(
              "Could not finish pitch-preserving sound processing.",
            );
          output.set(scratch.subarray(0, read * 2), offset * 2);
          offset += read;
          if (offset % 32768 === 0) await yieldTask();
        }
        soundTouch.clear();
        return { data: output, length };
      })();
      this.stretched.set(key, operation);
      return operation;
    }
    async prepareAudio() {
      const entries = this.project.items.filter(
        (value) =>
          value.kind === "audio" &&
          value.enabled &&
          value.start < this.end &&
          value.end > this.start,
      );
      for (const value of entries) {
        cancelled(this.signal);
        const pcm = await this.audio(value.assetId);
        if (
          pcm &&
          value.audio.preservePitch &&
          Math.abs(value.playbackRate - 1) > 1e-7
        )
          await this.stretch(value, pcm);
      }
    }
    async mix(first, length) {
      const buffer = new AudioBuffer({
          numberOfChannels: 2,
          length,
          sampleRate: SAMPLE_RATE,
        }),
        left = buffer.getChannelData(0),
        right = buffer.getChannelData(1);
      // A Web Audio render quantum is 128 samples. Split at item/fade boundaries
      // too, and use the same model gain function as the preview stereo bus.
      const boundaries = this.project.items
        .filter((i) => i.kind === "audio")
        .flatMap((i) => [
          i.start,
          i.end,
          i.start + i.audio.fadeIn,
          i.end - i.audio.fadeOut,
        ]);
      let offset = 0;
      while (offset < length) {
        const absolute = first + offset,
          time = this.start + absolute / SAMPLE_RATE;
        let size = Math.min(128, length - offset);
        for (const boundary of boundaries) {
          const distance =
            Math.ceil((boundary - this.start) * SAMPLE_RATE - 1e-7) - absolute;
          if (distance > 0) size = Math.min(size, distance);
        }
        for (const entry of M.evaluateAudio(
          this.project,
          time + 0.5 / SAMPLE_RATE,
        )) {
          const value = entry.item,
            pcm = await this.audio(value.assetId);
          if (!pcm) continue;
          const stretched =
            value.audio.preservePitch && Math.abs(value.playbackRate - 1) > 1e-7
              ? await this.stretch(value, pcm)
              : null;
          const gainStart = M.audioGains(this.project, value, time),
            gainEnd = M.audioGains(
              this.project,
              value,
              time + size / SAMPLE_RATE,
            );
          for (let j = 0; j < size; j++) {
            const at = time + j / SAMPLE_RATE,
              sourceTime = M.sourceTimeAt(value, at);
            let a, b;
            if (stretched) {
              const position = Math.max(
                0,
                Math.min(
                  stretched.length - 1,
                  Math.floor(
                    ((sourceTime - value.sourceIn) / value.playbackRate) *
                      SAMPLE_RATE +
                      1e-5,
                  ),
                ),
              );
              a = stretched.data[position * 2];
              b = stretched.data[position * 2 + 1];
            } else {
              const position = sourceTime * pcm.sampleRate,
                index = Math.floor(position),
                fraction = position - index;
              a =
                (pcm.left[index] || 0) * (1 - fraction) +
                (pcm.left[index + 1] || 0) * fraction;
              b =
                (pcm.right[index] || 0) * (1 - fraction) +
                (pcm.right[index + 1] || 0) * fraction;
            }
            if (gainStart.mono) a = b = (a + b) / 2;
            else if (gainStart.sourceChannel === "left") b = a;
            else if (gainStart.sourceChannel === "right") a = b;
            left[offset + j] +=
              a *
              (gainStart.left + ((gainEnd.left - gainStart.left) * j) / size);
            right[offset + j] +=
              b *
              (gainStart.right +
                ((gainEnd.right - gainStart.right) * j) / size);
          }
        }
        offset += size;
      }
      for (let i = 0; i < length; i++) {
        left[i] = Math.max(-Audio.CEILING, Math.min(Audio.CEILING, left[i]));
        right[i] = Math.max(-Audio.CEILING, Math.min(Audio.CEILING, right[i]));
      }
      return buffer;
    }
    async dispose() {
      for (const input of this.inputs.values()) input.dispose();
      await Promise.allSettled(
        [...this.readers.values()].map((reader) => reader.return()),
      );
      for (const element of this.fallbacks.values()) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      this.inputs.clear();
      this.readers.clear();
      this.frames.clear();
      if (!this.sharedCache) {
        this.pcm.clear();
        this.stretched.clear();
      }
    }
  }

  async function record(engine, start, end, onProgress, signal, cache) {
    if (signal?.aborted) return null;
    engine.stop();
    const project = engine.getProject(),
      formats = supported.length ? supported : await loadFormats();
    if (!formats.length)
      throw new Error(
        "This browser does not support frame-by-frame export. Use a browser with WebCodecs video and audio encoding.",
      );
    if (M.audioConflicts(project).length)
      throw new Error(
        "Only three sounds can play together. Review overlapping sounds before exporting.",
      );
    if (M.videoConflicts(project).length)
      throw new Error("Fix overlapping video clips before exporting.");
    for (const asset of project.assets)
      if (
        !engine.library.has(asset.id) &&
        project.items.some((i) => i.assetId === asset.id && i.enabled)
      )
        throw new Error("Relink " + asset.name + " before exporting.");
    const format =
        formats.find((f) => f[0] === project.exportSettings.format) ||
        formats[0],
      size = M.exportDimensions(project),
      fps = project.exportSettings.fps,
      duration = end - start,
      count = Math.ceil(duration * fps - 1e-7),
      canvas = Media.makeCanvas(size.width, size.height),
      sources = new Sources(project, engine.library, start, end, signal, cache),
      renderer = new Renderer(sources.renderLibrary);
    const target = new C.BufferTarget(),
      output = new C.Output({
        target,
        format:
          format[2] === "webm"
            ? new C.WebMOutputFormat()
            : new C.Mp4OutputFormat({ fastStart: "in-memory" }),
      });
    let encodedFrames = 0,
      audioWritten = 0;
    const video = new C.CanvasSource(canvas, {
      codec: format[3],
      latencyMode: "quality",
      keyFrameInterval: 2,
      quality: new C.Quality({
        bitrate: Math.round(project.exportSettings.bitrate * 1e6),
      }),
      onEncodedPacket: () => {
        encodedFrames++;
      },
    });
    output.addVideoTrack(video, { frameRate: fps });
    const audio = project.exportSettings.includeAudio
      ? new C.AudioBufferSource({
          codec: format[4],
          quality: new C.Quality({ bitrate: 192000 }),
        })
      : null;
    if (audio) output.addAudioTrack(audio);
    const began = performance.now();
    const abort = () => {
      output.cancel().catch(() => {});
      for (const input of sources.inputs.values()) input.dispose();
    };
    signal?.addEventListener("abort", abort, { once: true });
    const progress = (processed) =>
      onProgress({
        percent: processed / duration,
        processed,
        total: duration,
        remaining: processed
          ? ((performance.now() - began) / 1000 / processed) *
            (duration - processed)
          : null,
        frames: encodedFrames,
        totalFrames: count,
      });
    try {
      cancelled(signal);
      await output.start();
      if (audio) {
        progress(0);
        await sources.prepareAudio();
      }
      for (let frame = 0; frame < count; frame++) {
        cancelled(signal);
        const timestamp = frame / fps,
          time = start + timestamp,
          frameDuration = Math.min(1 / fps, duration - timestamp);
        await sources.prepareFrame(time, frame);
        cancelled(signal);
        const plan = renderer.render(project, time, canvas);
        await video.add(timestamp, frameDuration);
        if (audio) {
          const next = Math.round(
              Math.min(duration, (frame + 1) / fps) * SAMPLE_RATE,
            ),
            length = next - audioWritten;
          if (length > 0)
            await audio.add(await sources.mix(audioWritten, length));
          audioWritten = next;
        }
        if (frame % 3 === 0 || frame === count - 1) {
          const preview = engine.preview.getContext("2d");
          preview.clearRect(0, 0, engine.preview.width, engine.preview.height);
          preview.drawImage(
            canvas,
            0,
            0,
            engine.preview.width,
            engine.preview.height,
          );
          project.playhead = time;
          engine.onFrame(time, plan, 0);
          progress(Math.min(duration, (frame + 1) / fps));
          await yieldTask();
        }
      }
      video.close();
      audio?.close();
      await output.finalize();
      cancelled(signal);
      if (encodedFrames !== count)
        throw new Error(
          "Export frame count mismatch: expected " +
            count +
            ", encoded " +
            encodedFrames +
            ".",
        );
      const blob = new Blob([target.buffer], { type: format[0] });
      return {
        blob,
        width: size.width,
        height: size.height,
        duration,
        extension: format[2],
        mimeType: format[0],
        frameCount: count,
        fps,
        audioSamples: audioWritten,
      };
    } catch (error) {
      await output.cancel().catch(() => {});
      if (signal?.aborted) return null;
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      await sources.dispose();
      renderer.dispose();
    }
  }
  root.UTStudio.Export = {
    record,
    loadFormats,
    supportedFormats: () => supported,
    Sources,
    SAMPLE_RATE,
  };
})(globalThis);
