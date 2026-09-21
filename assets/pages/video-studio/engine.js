(function (root) {
  "use strict";
  const { Model: M, Media } = root.UTStudio;
  const supportedFormats = () => root.UTStudio.Export?.supportedFormats() || [];
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
      this.seeking = false;
      this.library.frameLimit = () =>
        Math.max(this.preview.width, this.preview.height);
    }
    get preparing() {
      return Boolean(this.session && this.session.anchor === null);
    }
    get playing() {
      return Boolean(this.session);
    }
    async prepare(project, time, signal) {
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
            await Media.seek(element, e.sourceTime, signal);
            await this.library.captureFrame?.(e.item, signal);
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
      const controller = (this.seekController = new AbortController());
      this.seeking = true;
      this.onState("seeking");
      try {
        await this.prepare(
          project,
          Math.min(project.playhead, Math.max(0, project.duration - 1e-6)),
          controller.signal,
        );
      } catch (error) {
        if (serial === this.seekSerial) throw error;
      } finally {
        if (serial === this.seekSerial) {
          this.seeking = false;
          this.onState("paused");
        }
      }
      if (serial === this.seekSerial)
        this.paint(project, project.playhead, this.preview);
      return serial === this.seekSerial;
    }
    paint(project, time, target = this.preview) {
      const plan = this.renderer.render(project, time, target);
      if (target !== this.preview) {
        const ctx = this.preview.getContext("2d");
        ctx.clearRect(0, 0, this.preview.width, this.preview.height);
        ctx.drawImage(target, 0, 0, this.preview.width, this.preview.height);
      }
      // Painting can finish late. Publish the clock's current position rather
      // than leaving transport time at the timestamp of that older frame.
      const position = this.session?.anchor != null ? this.currentTime : time;
      if (this.session?.anchor != null) project.playhead = position;
      this.onFrame(position, plan, this.mixer.peak());
      return plan;
    }
    // Playback time advances independently of decoder promises and painted frames.
    get currentTime() {
      const session = this.session;
      if (!session || session.anchor === null)
        return this.getProject().playhead;
      return Math.min(
        session.end,
        session.start + (performance.now() - session.anchor) / 1000,
      );
    }
    stop() {
      ++this.seekSerial;
      this.seekController?.abort();
      this.seeking = false;
      const session = this.session;
      if (session) {
        this.getProject().playhead = this.currentTime;
        session.cancelled = true;
        session.controller.abort();
        cancelAnimationFrame(session.frame);
        this.session = null;
        session.resolve(false);
      }
      this.library.pause();
      this.mixer.silence();
      this.onState("paused");
    }
    settings(state) {
      const { element, item } = state;
      if (state.rate !== item.playbackRate) {
        state.rate = item.playbackRate;
        element.playbackRate = item.playbackRate;
      }
      const preservePitch = item.audio?.preservePitch ?? true;
      if (element.preservesPitch !== preservePitch)
        element.preservesPitch = preservePitch;
      // Full-source music loops in the decoder. Seeking an ended, paused element
      // on every frame neither restarts its sound nor provides continuous audio.
      const loop = Boolean(
        item.audio?.loop &&
          item.sourceIn < 0.0001 &&
          Math.abs(
            item.sourceOut - M.asset(this.getProject(), item.assetId).duration,
          ) < 0.000001 &&
          Number.isFinite(element.duration) &&
          Math.abs(item.sourceOut - element.duration) < 0.05,
      );
      if (element.loop !== loop) element.loop = loop;
      state.nativeLoop = loop;
    }
    mediaState(session, item) {
      let state = session.media.get(item.id);
      if (!state) {
        const element = this.library.element(item);
        if (!element) return null;
        state = {
          item,
          element,
          ready: false,
          playing: false,
          pending: null,
          nextSync: 0,
        };
        session.media.set(item.id, state);
        if (item.kind === "audio") this.mixer.chain(item);
      }
      state.item = item;
      this.settings(state);
      return state;
    }
    prepareState(session, state, time) {
      if (!state || state.pending) return state?.pending;
      const operation = Media.seek(
        state.element,
        M.sourceTimeAt(state.item, time),
        session.controller.signal,
      ).then(async () => {
        if (session.cancelled) return;
        await this.library.captureFrame?.(
          state.item,
          session.controller.signal,
        );
        if (session.cancelled) return;
        state.ready = true;
        this.settings(state);
      });
      state.pending = operation;
      operation.catch(session.fail).finally(() => {
        if (state.pending === operation) state.pending = null;
      });
      return operation;
    }
    startState(session, state, time) {
      if (!state || state.pending) return;
      if (!state.ready) {
        this.prepareState(session, state, time);
        return;
      }
      state.playing = true;
      const operation = state.element.play();
      state.pending = operation;
      operation.catch(session.fail).finally(() => {
        if (state.pending === operation) state.pending = null;
      });
    }
    syncState(session, state, time) {
      if (!state || state.pending) return;
      this.settings(state);
      const { item, element } = state;
      if (item.audio?.loop && !state.nativeLoop) {
        const cycle = Math.floor(
          ((time - item.start) * item.playbackRate + (item.audio.offset || 0)) /
            M.sourceSpan(item),
        );
        if (state.loopCycle !== undefined && cycle !== state.loopCycle) {
          state.loopCycle = cycle;
          state.ready = false;
          if (item.kind !== "audio") {
            state.playing = false;
            element.pause();
          }
          this.prepareState(session, state, time);
          return;
        }
        state.loopCycle = cycle;
      }
      if (!state.playing || element.paused) {
        this.startState(session, state, time);
        return;
      }
      if (element.seeking || time < state.nextSync) return;
      state.nextSync = time + 0.2;
      let error = M.sourceTimeAt(item, time) - element.currentTime;
      if (state.nativeLoop) {
        const length = M.sourceSpan(item);
        // Positions just before/after a native loop are adjacent, not a full
        // song apart. Compare the shortest distance around that loop.
        error =
          ((((error + length / 2) % length) + length) % length) - length / 2;
      }
      error /= item.playbackRate;
      if (Math.abs(error) > 0.25) {
        state.ready = false;
        // Audio seeks keep the existing playback stream alive. Pausing here
        // introduces a second startup gap after a delayed native music repeat.
        if (item.kind !== "audio") {
          state.playing = false;
          element.pause();
        }
        this.prepareState(session, state, time);
      } else {
        // Small decoder-clock differences are corrected gradually; avoid a
        // seek/reset cycle and preserve pitch while the picture clock keeps 1×.
        const adjustment =
          Math.abs(error) < 0.015 ? 1 : 1 + M.clamp(error, -0.1, 0.1);
        const rate = item.playbackRate * adjustment;
        if (Math.abs(element.playbackRate - rate) > 0.0005)
          element.playbackRate = rate;
      }
    }
    warmUpcoming(session, project, time) {
      if (time < session.nextWarm) return;
      session.nextWarm = time + 0.2;
      for (const item of project.items) {
        if (
          !item.assetId ||
          !["video", "audio"].includes(item.kind) ||
          item.start <= time ||
          item.start > time + 1.5 ||
          session.media.has(item.id)
        )
          continue;
        if (
          !M.visibleItems(project, item.start, item.kind === "audio").some(
            (i) => i.id === item.id,
          )
        )
          continue;
        this.prepareState(session, this.mediaState(session, item), item.start);
      }
    }
    play(options = {}) {
      this.stop();
      const project = this.getProject();
      if (M.audioConflicts(project).length)
        return Promise.reject(
          new Error(
            "Only three sounds can play at the same time. Use Review overlapping sounds to mute or move a sound before playback.",
          ),
        );
      if (M.videoConflicts(project).length)
        return Promise.reject(
          new Error(
            "Overlapping items occupy the same video track. Use Fix automatically or shorten an overlay before playback.",
          ),
        );
      if (options.signal?.aborted) return Promise.resolve(false);
      const start =
          options.start ??
          (project.playhead >= project.duration - 0.01 ? 0 : project.playhead),
        end = options.end ?? project.duration;
      if (end <= start) return Promise.resolve(false);
      let resolve, reject;
      const completion = new Promise((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const session = {
        start,
        end,
        anchor: null,
        resolve,
        reject,
        cancelled: false,
        frame: 0,
        controller: new AbortController(),
        media: new Map(),
        nextWarm: start,
      };
      this.session = session;
      const abort = () => {
        if (this.session === session) this.stop();
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      completion
        .finally(() => options.signal?.removeEventListener("abort", abort))
        .catch(() => {});
      session.fail = (error) => {
        if (session.cancelled || this.session !== session) return;
        reject(error);
        this.stop();
        options.onError?.(error);
        this.onState("error", error);
      };
      const target = options.canvas || this.preview;
      let lastFrame = -Infinity;
      // A slow seek/play promise for one layer must never suspend this callback.
      const tick = () => {
        if (session.cancelled) return;
        try {
          const time = this.currentTime,
            safeTime = Math.min(time, end - 1e-6);
          project.playhead = time;
          const frame = M.evaluateFrame(project, safeTime),
            audio = M.evaluateAudio(project, safeTime);
          const entries = [
            ...frame.items.filter((e) => e.item.kind === "video"),
            ...audio,
          ];
          const live = new Set(entries.map((e) => e.item.id));
          for (const e of entries)
            this.syncState(session, this.mediaState(session, e.item), safeTime);
          for (const [key, state] of session.media) {
            if (!live.has(key) && state.playing) {
              state.element.pause();
              state.playing = false;
            }
          }
          this.warmUpcoming(session, project, safeTime);
          this.mixer.apply(project, safeTime);
          if (
            time - lastFrame >= 1 / project.exportSettings.fps - 0.002 ||
            time >= end
          ) {
            this.paint(project, safeTime, target);
            lastFrame = time;
            options.onTick?.(time - start, end - start);
          }
          if (time >= end) {
            session.cancelled = true;
            session.controller.abort();
            this.library.pause();
            this.mixer.silence();
            this.session = null;
            this.onState("paused");
            resolve(true);
          } else session.frame = requestAnimationFrame(tick);
        } catch (error) {
          session.fail(error);
        }
      };
      const initialize = async () => {
        this.onState("preparing");
        await this.mixer.ready();
        if (session.cancelled) return;
        const initial = await this.prepare(
          project,
          start,
          session.controller.signal,
        );
        if (session.cancelled) return;
        this.mixer.apply(project, start);
        await Promise.all(
          initial.map(async (e) => {
            const state = this.mediaState(session, e.item);
            if (!state) return;
            state.ready = true;
            await state.element.play();
            if (!session.cancelled) state.playing = true;
          }),
        );
        if (session.cancelled) return;
        this.paint(project, start, target);
        await options.onReady?.();
        if (session.cancelled) return;
        session.anchor = performance.now();
        this.onState(options.recording ? "exporting" : "playing");
        session.frame = requestAnimationFrame(tick);
      };
      initialize().catch(session.fail);
      return completion;
    }
    async recordRange(start, end, onProgress = () => {}, signal, cache) {
      return root.UTStudio.Export.record(this, start, end, onProgress, signal, cache);
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
