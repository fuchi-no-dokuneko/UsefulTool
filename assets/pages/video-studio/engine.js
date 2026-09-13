(function (root) {
  "use strict";
  const { Model: M, Media } = root.UTStudio;
  const FORMATS = [
    ["video/webm;codecs=vp9,opus", "WebM · VP9 + Opus", "webm"],
    ["video/webm;codecs=vp8,opus", "WebM · VP8 + Opus", "webm"],
    ["video/webm", "WebM · Browser default", "webm"],
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "MP4 · H.264 + AAC", "mp4"],
    ["video/mp4", "MP4 · Browser default", "mp4"],
  ];
  const supportedFormats = () =>
    typeof MediaRecorder === "undefined"
      ? []
      : FORMATS.filter(([type]) => MediaRecorder.isTypeSupported(type));
  class Engine {
    constructor(
      getProject,
      library,
      renderer,
      mixer,
      preview,
      onFrame = () => {},
      onState = () => {},
    ) {
      Object.assign(this, {
        getProject,
        library,
        renderer,
        mixer,
        preview,
        onFrame,
        onState,
      });
      this.session = null;
      this.seekSerial = 0;
    }
    get playing() {
      return Boolean(this.session);
    }
    async prepare(project, time) {
      const plan = M.evaluateFrame(project, time),
        audio = M.evaluateAudio(project, time);
      const values = [
        ...plan.items.filter((e) => e.item.kind === "video"),
        ...audio,
      ];
      await Promise.all(
        values.map(async (e) => {
          const element = this.library.element(e.item);
          if (element) {
            element.playbackRate = e.item.playbackRate;
            element.preservesPitch = e.item.audio?.preservePitch ?? true;
            await Media.seek(element, e.sourceTime);
          }
        }),
      );
      return values;
    }
    async seek(time) {
      this.stop();
      const serial = ++this.seekSerial,
        project = this.getProject();
      project.playhead = M.clamp(time, 0, project.duration);
      try {
        await this.prepare(
          project,
          Math.min(project.playhead, Math.max(0, project.duration - 1e-6)),
        );
      } catch (error) {
        if (serial === this.seekSerial) throw error;
      }
      if (serial === this.seekSerial)
        this.paint(project, project.playhead, this.preview);
    }
    paint(project, time, target = this.preview) {
      const plan = this.renderer.render(project, time, target);
      if (target !== this.preview) {
        const ctx = this.preview.getContext("2d");
        ctx.clearRect(0, 0, this.preview.width, this.preview.height);
        ctx.drawImage(target, 0, 0, this.preview.width, this.preview.height);
      }
      this.onFrame(time, plan, this.mixer.peak());
      return plan;
    }
    stop() {
      ++this.seekSerial;
      const session = this.session;
      if (session) {
        session.cancelled = true;
        cancelAnimationFrame(session.frame);
        this.session = null;
        session.resolve(false);
      }
      this.library.pause();
      this.mixer.silence();
      this.onState("paused");
    }
    async play(options = {}) {
      this.stop();
      const project = this.getProject();
      if (M.videoConflicts(project).length)
        throw new Error(
          "Overlapping items occupy the same video track. Use Fix automatically or shorten an overlay before playback.",
        );
      if (options.signal?.aborted) return false;
      const start =
          options.start ??
          (project.playhead >= project.duration - 0.01 ? 0 : project.playhead),
        end = options.end ?? project.duration;
      if (end <= start) return false;
      let resolve;
      const completion = new Promise((done) => {
        resolve = done;
      });
      const session = {
        resolve,
        cancelled: false,
        frame: 0,
        playing: new Set(),
        recording: Boolean(options.recording),
      };
      this.session = session;
      const abort = () => {
        if (this.session === session) this.stop();
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      completion.finally(() =>
        options.signal?.removeEventListener("abort", abort),
      );
      try {
        this.onState("preparing");
        await this.mixer.ready();
        if (session.cancelled) return false;
        const initial = await this.prepare(project, start);
        if (session.cancelled) return false;
        this.mixer.apply(project, start);
        await Promise.all(
          initial.map(async (e) => {
            const element = this.library.element(e.item);
            if (!element) return;
            if (e.item.kind === "audio") this.mixer.chain(e.item);
            await element.play();
            session.playing.add(e.item.id);
          }),
        );
        if (session.cancelled) {
          this.library.pause();
          this.mixer.silence();
          return false;
        }
        const target = options.canvas || this.preview;
        this.paint(project, start, target);
        await options.onReady?.();
        if (session.cancelled) return false;
        this.onState(options.recording ? "exporting" : "playing");
        const anchor = performance.now();
        let lastFrame = -Infinity;
        const step = async () => {
          if (session.cancelled) return;
          try {
            const time = Math.min(
              end,
              start + (performance.now() - anchor) / 1000,
            );
            const safeTime = Math.min(time, Math.max(start, end - 1e-6));
            const frame = M.evaluateFrame(project, safeTime),
              audio = M.evaluateAudio(project, safeTime);
            const entries = [
                ...frame.items.filter((e) => e.item.kind === "video"),
                ...audio,
              ],
              live = new Set(entries.map((e) => e.item.id));
            for (const e of entries) {
              const element = this.library.element(e.item);
              if (!element) continue;
              element.playbackRate = e.item.playbackRate;
              element.preservesPitch = e.item.audio?.preservePitch ?? true;
              if (e.item.kind === "audio") this.mixer.chain(e.item);
              if (!session.playing.has(e.item.id)) {
                await Media.seek(element, e.sourceTime);
                if (session.cancelled) return;
                await element.play();
                session.playing.add(e.item.id);
              } else if (
                Math.abs(element.currentTime - e.sourceTime) > 0.12 &&
                !element.seeking
              )
                element.currentTime = e.sourceTime;
            }
            for (const key of session.playing)
              if (!live.has(key)) {
                this.library.elements.get(key)?.pause();
                session.playing.delete(key);
              }
            if (session.cancelled) return;
            this.mixer.apply(project, safeTime);
            project.playhead = time;
            if (
              time - lastFrame >= 1 / project.exportSettings.fps - 0.002 ||
              time >= end
            ) {
              this.paint(project, safeTime, target);
              lastFrame = time;
              options.onTick?.(time - start, end - start);
            }
            if (time >= end) {
              this.library.pause();
              this.mixer.silence();
              this.session = null;
              this.onState("paused");
              session.resolve(true);
              return;
            }
            session.frame = requestAnimationFrame(step);
          } catch (error) {
            this.stop();
            options.onError?.(error);
            this.onState("error", error);
          }
        };
        session.frame = requestAnimationFrame(step);
        return await completion;
      } catch (error) {
        this.stop();
        throw error;
      }
    }
    async recordRange(start, end, onProgress = () => {}, signal) {
      if (signal?.aborted) return null;
      const project = this.getProject(),
        formats = supportedFormats();
      if (!this.preview.captureStream || !formats.length)
        throw new Error(
          "This browser cannot export video. Open the project in a browser with video recording support.",
        );
      const missing = project.assets.filter(
        (a) =>
          project.items.some((i) => i.assetId === a.id && i.enabled) &&
          !this.library.has(a.id),
      );
      if (missing.length)
        throw new Error("Relink " + missing[0].name + " before exporting.");
      const type =
        formats.find((f) => f[0] === project.exportSettings.format) ||
        formats[0];
      const size = M.exportDimensions(project),
        output = Media.makeCanvas(size.width, size.height);
      await this.mixer.ready();
      if (signal?.aborted) return null;
      const videoStream = output.captureStream(project.exportSettings.fps);
      const tracks = [...videoStream.getVideoTracks()];
      if (project.exportSettings.includeAudio)
        tracks.push(
          ...this.mixer.capture.stream.getAudioTracks().map((t) => t.clone()),
        );
      const stream = new MediaStream(tracks),
        recorder = new MediaRecorder(stream, {
          mimeType: type[0],
          videoBitsPerSecond: Math.round(
            project.exportSettings.bitrate * 1000000,
          ),
          audioBitsPerSecond: 192000,
        });
      const chunks = [];
      let recordError;
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onstop = resolve;
        recorder.onerror = (e) => {
          recordError = e.error || new Error("Video recording failed.");
          reject(recordError);
        };
      });
      stopped.catch(() => {});
      const began = performance.now();
      try {
        const complete = await this.play({
          start,
          end,
          canvas: output,
          recording: true,
          signal,
          onReady: () => {
            recorder.start(250);
            tracks[0].requestFrame?.();
          },
          onTick: (processed, total) => {
            const elapsed = (performance.now() - began) / 1000;
            onProgress({
              percent: processed / total,
              processed,
              total,
              remaining:
                processed > 0.05
                  ? (elapsed / processed) * (total - processed)
                  : null,
            });
          },
          onError: (error) => {
            recordError = error;
          },
        });
        if (recorder.state !== "inactive") recorder.stop();
        else if (!chunks.length) return null;
        await stopped;
        if (recordError) throw recordError;
        if (!complete) return null;
        const raw = new Blob(chunks, { type: recorder.mimeType || type[0] });
        const blob = await root.UTStudio.finalizeWebmDuration(raw, end - start);
        return {
          blob,
          width: size.width,
          height: size.height,
          duration: end - start,
          extension: type[2],
          mimeType: raw.type,
        };
      } finally {
        if (recorder.state !== "inactive") recorder.stop();
        for (const track of tracks) track.stop();
      }
    }
    async dispose() {
      this.stop();
      this.renderer.dispose();
      await this.mixer.dispose();
    }
  }
  root.UTStudio.Engine = Engine;
  root.UTStudio.supportedFormats = supportedFormats;
})(globalThis);
