/* Local media decoding, identity, thumbnails, waveforms and scene measurements. */
(function (root) {
  "use strict";
  const M = root.UTStudio.Model;
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const rotate = (v, n) => v >>> n | v << 32 - n;
  class SHA256 {
    constructor() { this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]); this.tail = new Uint8Array(0); this.length = 0; this.w = new Uint32Array(64); }
    block(bytes, offset) {
      const w = this.w;
      for (let i = 0; i < 16; i++) { const n = offset + i * 4; w[i] = bytes[n] << 24 | bytes[n + 1] << 16 | bytes[n + 2] << 8 | bytes[n + 3]; }
      for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = w[i - 16] + (rotate(a,7)^rotate(a,18)^a>>>3) + w[i-7] + (rotate(b,17)^rotate(b,19)^b>>>10); }
      let [a,b,c,d,e,f,g,h] = this.h;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + (e&f ^ ~e&g) + K[i] + w[i]) | 0;
        const t2 = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + (a&b ^ a&c ^ b&c)) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      [a,b,c,d,e,f,g,h].forEach((v,i) => { this.h[i] += v; });
    }
    update(chunk) {
      this.length += chunk.length;
      let bytes = chunk;
      if (this.tail.length) { bytes = new Uint8Array(this.tail.length + chunk.length); bytes.set(this.tail); bytes.set(chunk, this.tail.length); }
      let offset = 0;
      for (; offset + 64 <= bytes.length; offset += 64) this.block(bytes, offset);
      this.tail = bytes.slice(offset); return this;
    }
    digest() {
      const padded = new Uint8Array(this.tail.length < 56 ? 64 : 128);
      padded.set(this.tail); padded[this.tail.length] = 128;
      new DataView(padded.buffer).setBigUint64(padded.length - 8, BigInt(this.length) * 8n);
      for (let offset = 0; offset < padded.length; offset += 64) this.block(padded, offset);
      return [...this.h].map((v) => v.toString(16).padStart(8,"0")).join("");
    }
  }
  async function hashFile(file) {
    const sha = new SHA256(), chunk = 4 * 1024 * 1024;
    for (let offset = 0; offset < file.size; offset += chunk) {
      sha.update(new Uint8Array(await file.slice(offset, offset + chunk).arrayBuffer()));
      if (offset) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return sha.digest();
  }
  function fileKind(file) {
    if (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) return "video";
    if (file.type === "audio/mpeg" || /\.mp3$/i.test(file.name)) return "audio";
    if (/\.(png|jpe?g|bmp|gif|webp)$/i.test(file.name) || /^image\/(png|jpeg|bmp|gif|webp)$/.test(file.type)) return "image";
    throw new Error("Choose a video, MP3, PNG, JPG, BMP, GIF or WebP file.");
  }
  function waitMedia(element, event = "loadeddata", timeout = 20000) {
    if (event === "loadeddata" && element.readyState >= 2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      // Seeking can temporarily lower readyState after loadeddata has already
      // fired. canplay/seeked must also release a waiter for decoded pixels.
      const events = event === "loadeddata" ? ["loadeddata", "canplay", "seeked"] : [event];
      const clean = () => { clearTimeout(timer); events.forEach(name => element.removeEventListener(name, ok)); element.removeEventListener("error", bad); };
      const ok = () => { if (event === "loadeddata" && element.readyState < 2) return; clean(); resolve(); };
      const bad = () => { clean(); reject(new Error("This browser could not decode the file. Try a different video codec or MP3.")); };
      const timer = setTimeout(() => { clean(); reject(new Error("Reading the media timed out. Try a smaller file.")); }, timeout);
      events.forEach(name => element.addEventListener(name, ok)); element.addEventListener("error", bad, { once: true });
    });
  }
  const pendingSeeks = new WeakMap();
  function seek(element, time) {
    // A restored preview and a new playback request can seek the same decoder.
    // Serialize those requests so neither consumes the other's seeked event.
    const result = (pendingSeeks.get(element) || Promise.resolve()).catch(() => {}).then(() => seekNow(element, time));
    pendingSeeks.set(element, result);
    result.finally(() => { if (pendingSeeks.get(element) === result) pendingSeeks.delete(element); }).catch(() => {});
    return result;
  }
  async function seekNow(element, time) {
    await waitMedia(element);
    const target = M.clamp(time, 0, Math.max(0, element.duration - .00001));
    if (Math.abs(element.currentTime - target) < .0001 && !element.seeking) return;
    const ready = waitMedia(element, "seeked"); element.currentTime = target; await ready;
  }
  function makeCanvas(width, height) { const c = document.createElement("canvas"); c.width = width; c.height = height; return c; }
  function poster(source, width, height) {
    const c = makeCanvas(160, Math.max(1, Math.round(160 * height / width)));
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }
  async function waveform(file) {
    // Avoid allocating many gigabytes of decoded PCM merely to draw a thumbnail.
    if (file.size > 128 * 1024 * 1024) return { waveform: [], waveformStatus: "Waveform omitted for this large file" };
    const Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!Offline) return { waveform: [], waveformStatus: "Waveform unavailable in this browser" };
    try {
      const context = new Offline(1, 1, 22050);
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const bins = 512, peaks = Array(bins).fill(0);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel), size = Math.ceil(data.length / bins);
        for (let bin = 0; bin < bins; bin++) {
          const stop = Math.min(data.length, (bin + 1) * size);
          let peak = 0;
          for (let j = bin * size; j < stop; j++) peak = Math.max(peak, Math.abs(data[j]));
          peaks[bin] = Math.max(peaks[bin], Math.round(peak * 1000) / 1000);
        }
      }
      return { waveform: peaks, waveformStatus: "Ready", audioDuration: buffer.duration };
    } catch { return { waveform: [], waveformStatus: "No decodable waveform; playback may still be available" }; }
  }
  class MediaLibrary {
    constructor() { this.assets = new Map(); this.elements = new Map(); }
    async read(file, requestedKind) {
      const kind = fileKind(file);
      if (requestedKind && kind !== requestedKind) throw new Error("This file is not a supported " + requestedKind + " file.");
      if (file.size === 0) throw new Error("This file is empty.");
      if (file.size > (kind === "image" ? 25 * 1024 * 1024 : 1024 * 1024 * 1024)) throw new Error(kind === "image" ? "Images must be at most 25 MiB." : "Media files must be at most 1 GiB.");
      const descriptor = { id: M.id("asset"), kind, name: file.name, mimeType: file.type, size: file.size, contentHash: await hashFile(file) };
      const runtime = await this.attach(descriptor, file);
      if (kind === "image") {
        const image = runtime.image;
        const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
        Object.assign(descriptor, { width, height, thumbnail: poster(image, width, height) });
        const c = makeCanvas(Math.min(256, width), Math.min(256, height));
        const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0, c.width, c.height);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        descriptor.transparent = data.some((alpha, index) => index % 4 === 3 && alpha < 255);
        descriptor.animated = /\.gif$/i.test(file.name);
        // Freeze GIF/WebP at the decoded first frame for deterministic still-image exports.
        const still = makeCanvas(width, height); still.getContext("2d").drawImage(image, 0, 0);
        runtime.image = still;
      } else {
        const element = runtime.probe;
        if (!Number.isFinite(element.duration) || element.duration < M.MIN) throw new Error("The file has no readable finite duration.");
        descriptor.duration = element.duration;
        if (kind === "video") {
          descriptor.width = element.videoWidth; descriptor.height = element.videoHeight;
          if (!(descriptor.width && descriptor.height)) throw new Error("This file has no readable video frames.");
          descriptor.thumbnail = poster(element, descriptor.width, descriptor.height);
        }
        Object.assign(descriptor, await waveform(file));
      }
      return descriptor;
    }
    async attach(descriptor, file) {
      const existing = this.assets.get(descriptor.id);
      if (existing) return existing;
      const entry = { file, url: URL.createObjectURL(file) };
      try {
        if (descriptor.kind === "image") {
          const image = new Image(); image.src = entry.url; await image.decode(); entry.image = image;
          if (/\.(gif|webp)$/i.test(descriptor.name)) {
            const c = makeCanvas(image.naturalWidth, image.naturalHeight); c.getContext("2d").drawImage(image, 0, 0); entry.image = c;
          }
        } else {
          const element = document.createElement(descriptor.kind === "video" ? "video" : "audio");
          element.preload = "auto"; element.muted = true; element.playsInline = true; element.src = entry.url;
          await waitMedia(element); entry.probe = element;
        }
        this.assets.set(descriptor.id, entry); return entry;
      } catch (error) { URL.revokeObjectURL(entry.url); throw error; }
    }
    has(assetId) { return this.assets.has(assetId); }
    element(value) {
      if (this.elements.has(value.id)) return this.elements.get(value.id);
      const entry = this.assets.get(value.assetId);
      if (!entry || value.kind === "image") return null;
      const element = document.createElement(value.kind === "video" ? "video" : "audio");
      element.preload = "auto"; element.playsInline = true; element.muted = value.kind === "video";
      element.preservesPitch = true; element.src = entry.url;
      this.elements.set(value.id, element); return element;
    }
    async relink(descriptor, file) {
      if (descriptor.size !== file.size || descriptor.name !== file.name || descriptor.contentHash !== await hashFile(file)) throw new Error("This file does not match the saved name, size and content. Choose the original file.");
      await this.attach(descriptor, file); return descriptor;
    }
    async analyze(descriptor, progress = () => {}) {
      if (descriptor.analysis) return descriptor.analysis;
      if (descriptor.kind !== "video") return { cuts: [], peaks: [] };
      const entry = this.assets.get(descriptor.id);
      if (!entry) throw new Error("Relink " + descriptor.name + " before making a movie.");
      const video = entry.probe, c = makeCanvas(48, 27), ctx = c.getContext("2d", { willReadFrequently: true });
      const count = Math.max(2, Math.min(60, Math.ceil(descriptor.duration))), cuts = []; let previous = null;
      for (let i = 0; i < count; i++) {
        const time = Math.min(descriptor.duration - .001, i * descriptor.duration / count);
        await seek(video, time); ctx.drawImage(video, 0, 0, c.width, c.height);
        const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
        if (previous) {
          let difference = 0;
          for (let j = 0; j < pixels.length; j += 4) difference += Math.abs(pixels[j] - previous[j]) + Math.abs(pixels[j+1] - previous[j+1]) + Math.abs(pixels[j+2] - previous[j+2]);
          cuts.push({ time, change: difference / (c.width * c.height * 3 * 255) });
        }
        previous = pixels; progress((i + 1) / count);
      }
      const peaks = (descriptor.waveform || []).map((level, index, list) => ({ time: index / list.length * descriptor.duration, level })).filter((p) => p.level > .55);
      descriptor.analysis = { cuts: cuts.sort((a,b) => b.change - a.change), peaks };
      await seek(video, 0); return descriptor.analysis;
    }
    pause() { for (const element of this.elements.values()) element.pause(); }
    dispose() {
      this.pause();
      for (const element of this.elements.values()) { element.removeAttribute("src"); element.load(); }
      for (const entry of this.assets.values()) { if (entry.probe) { entry.probe.removeAttribute("src"); entry.probe.load(); } URL.revokeObjectURL(entry.url); }
      this.elements.clear(); this.assets.clear();
    }
  }
  root.UTStudio.Media = { SHA256, hashFile, fileKind, waitMedia, seek, makeCanvas, MediaLibrary };
  if (typeof module !== "undefined") module.exports = root.UTStudio.Media;
})(globalThis);
