/* One stereo graph feeds both the preview monitor and recording destination. */
(function (root) {
  "use strict";
  const M = root.UTStudio.Model;
  const CEILING = Math.pow(10, -1 / 20);
  function createLimiter(context) {
    const node = context.createWaveShaper(),
      curve = new Float32Array(65537);
    for (let i = 0; i < curve.length; i++)
      curve[i] = Math.max(
        -CEILING,
        Math.min(CEILING, (i / (curve.length - 1)) * 2 - 1),
      );
    node.curve = curve;
    node.oversample = "none";
    return node;
  }
  class AudioMixer {
    constructor(library) {
      this.library = library;
      this.context = null;
      this.chains = new Map();
      this.muted = false;
    }
    async ready() {
      if (!this.context) {
        const Context = root.AudioContext || root.webkitAudioContext;
        if (!Context)
          throw new Error("This browser does not provide audio mixing.");
        const context = (this.context = new Context());
        this.bus = context.createGain();
        this.bus.channelCount = 2;
        this.bus.channelCountMode = "explicit";
        this.limiter = createLimiter(context);
        this.monitor = context.createGain();
        this.capture = context.createMediaStreamDestination();
        this.bus.connect(this.limiter);
        this.limiter.connect(this.monitor);
        this.limiter.connect(this.capture);
        this.monitor.connect(context.destination);
        this.analyser = context.createAnalyser();
        this.limiter.connect(this.analyser);
        this.analyser.fftSize = 256;
      }
      if (this.context.state === "suspended") await this.context.resume();
      this.monitor.gain.value = this.muted ? 0 : 1;
      return this;
    }
    chain(value) {
      if (this.chains.has(value.id)) return this.chains.get(value.id);
      const element = this.library.element(value);
      if (!element) return null;
      const c = this.context,
        source = c.createMediaElementSource(element),
        upmix = c.createGain(),
        split = c.createChannelSplitter(2),
        left = c.createGain(),
        right = c.createGain(),
        merge = c.createChannelMerger(2);
      upmix.channelCount = 2;
      upmix.channelCountMode = "explicit";
      upmix.channelInterpretation = "speakers";
      source.connect(upmix);
      upmix.connect(split);
      split.connect(left, 0);
      split.connect(right, 1);
      left.connect(merge, 0, 0);
      right.connect(merge, 0, 1);
      merge.connect(this.bus);
      left.gain.value = 0;
      right.gain.value = 0;
      const chain = { element, source, left, right, merge, upmix, split };
      this.chains.set(value.id, chain);
      return chain;
    }
    apply(project, time) {
      if (!this.context) return [];
      const plan = M.evaluateAudio(project, time),
        live = new Set(plan.map((e) => e.item.id)),
        now = this.context.currentTime;
      for (const entry of plan) {
        const chain = this.chain(entry.item);
        if (!chain) continue;
        chain.left.gain.setValueAtTime(entry.left, now);
        chain.right.gain.setValueAtTime(entry.right, now);
        chain.element.preservesPitch = entry.preservePitch;
        chain.element.playbackRate = entry.playbackRate;
      }
      for (const [key, chain] of this.chains)
        if (!live.has(key)) {
          chain.left.gain.setValueAtTime(0, now);
          chain.right.gain.setValueAtTime(0, now);
        }
      return plan;
    }
    silence() {
      for (const c of this.chains.values()) {
        c.left.gain.value = 0;
        c.right.gain.value = 0;
      }
    }
    setMuted(value) {
      this.muted = value;
      if (this.monitor) this.monitor.gain.value = value ? 0 : 1;
    }
    peak() {
      if (!this.analyser) return 0;
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      return data.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
    }
    async dispose() {
      this.silence();
      if (this.context) await this.context.close();
      this.chains.clear();
      this.context = null;
    }
  }
  root.UTStudio.Audio = { AudioMixer, createLimiter, CEILING };
})(globalThis);
