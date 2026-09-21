/* Streaming, uncompressed ZIP/ZIP64. Videos are already compressed.
 * Format: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * Keep only central-directory metadata and the current segment in memory.
 */
(function (root) {
  "use strict";
  const MAX32 = 0xffffffff,
    MAX16 = 0xffff;
  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let n = 0; n < 8; n++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value >>> 0;
  });
  function block(length) {
    const bytes = new Uint8Array(length),
      view = new DataView(bytes.buffer);
    return {
      bytes,
      u16: (at, n) => view.setUint16(at, n, true),
      u32: (at, n) => view.setUint32(at, n, true),
      u64: (at, n) => view.setBigUint64(at, BigInt(n), true),
    };
  }
  class ZipWriter {
    constructor(sink, signal) {
      this.sink = sink;
      this.signal = signal;
      this.offset = 0;
      this.entries = [];
      this.closed = false;
    }
    async write(bytes) {
      this.signal?.throwIfAborted();
      if (this.closed) throw new Error("This ZIP is already closed.");
      await this.sink.write(bytes);
      this.offset += bytes.length;
      this.signal?.throwIfAborted();
    }
    async add(name, blob) {
      const filename = new TextEncoder().encode(name),
        offset = this.offset;
      if (!filename.length || filename.length > MAX16 || /[\\/\0]/.test(name))
        throw new Error("Use a simple ZIP entry filename.");
      const large = blob.size >= MAX32,
        extra = large ? 20 : 0;
      const header = block(30 + filename.length + extra);
      header.u32(0, 0x04034b50);
      header.u16(4, large ? 45 : 20);
      header.u16(6, 0x0808);
      header.u16(12, 33); // UTF-8, data descriptor, 1980-01-01.
      header.u32(18, large ? MAX32 : 0);
      header.u32(22, large ? MAX32 : 0);
      header.u16(26, filename.length);
      header.u16(28, extra);
      header.bytes.set(filename, 30);
      if (large) {
        const at = 30 + filename.length;
        header.u16(at, 1);
        header.u16(at + 2, 16);
        header.u64(at + 4, blob.size);
        header.u64(at + 12, blob.size);
      }
      await this.write(header.bytes);
      const reader = blob.stream().getReader();
      let crc = MAX32,
        size = 0,
        yieldedAt = 0;
      try {
        while (true) {
          this.signal?.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          for (const byte of value)
            crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
          size += value.length;
          await this.write(value);
          if (size - yieldedAt >= 4 * 1024 * 1024) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            yieldedAt = size;
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (size !== blob.size)
        throw new Error(
          "The segment stream ended before all bytes were written.",
        );
      crc = (crc ^ MAX32) >>> 0;
      const descriptor = block(large ? 24 : 16);
      descriptor.u32(0, 0x08074b50);
      descriptor.u32(4, crc);
      if (large) {
        descriptor.u64(8, size);
        descriptor.u64(16, size);
      } else {
        descriptor.u32(8, size);
        descriptor.u32(12, size);
      }
      await this.write(descriptor.bytes);
      this.entries.push({ filename, size, crc, offset });
    }
    async finish() {
      const start = this.offset;
      let written = 0;
      for (const entry of this.entries) {
        const { filename, size, crc, offset } = entry;
        const large = size >= MAX32,
          far = offset >= MAX32;
        const extra = large || far ? 4 + (large ? 16 : 0) + (far ? 8 : 0) : 0;
        const header = block(46 + filename.length + extra);
        header.u32(0, 0x02014b50);
        header.u16(4, 0x032d); // Unix creator: no legacy DOS filename recoding.
        header.u16(6, extra ? 45 : 20);
        header.u16(8, 0x0808);
        header.u16(14, 33);
        header.u32(16, crc);
        header.u32(20, large ? MAX32 : size);
        header.u32(24, large ? MAX32 : size);
        header.u16(28, filename.length);
        header.u16(30, extra);
        header.u32(38, 0x81a40000); // Regular file, owner writable, readable by everyone.
        header.u32(42, far ? MAX32 : offset);
        header.bytes.set(filename, 46);
        if (extra) {
          let at = 46 + filename.length;
          header.u16(at, 1);
          header.u16(at + 2, extra - 4);
          at += 4;
          if (large) {
            header.u64(at, size);
            header.u64(at + 8, size);
            at += 16;
          }
          if (far) header.u64(at, offset);
        }
        await this.write(header.bytes);
        if (++written % 256 === 0)
          await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const size = this.offset - start,
        count = this.entries.length;
      const zip64 =
        count >= MAX16 ||
        start >= MAX32 ||
        size >= MAX32 ||
        this.entries.some((e) => e.size >= MAX32);
      if (zip64) {
        const offset = this.offset,
          end = block(56),
          locator = block(20);
        end.u32(0, 0x06064b50);
        end.u64(4, 44);
        end.u16(12, 45);
        end.u16(14, 45);
        end.u64(24, count);
        end.u64(32, count);
        end.u64(40, size);
        end.u64(48, start);
        await this.write(end.bytes);
        locator.u32(0, 0x07064b50);
        locator.u64(8, offset);
        locator.u32(16, 1);
        await this.write(locator.bytes);
      }
      const end = block(22);
      end.u32(0, 0x06054b50);
      end.u16(8, Math.min(count, MAX16));
      end.u16(10, Math.min(count, MAX16));
      end.u32(12, Math.min(size, MAX32));
      end.u32(16, Math.min(start, MAX32));
      await this.write(end.bytes);
      await this.sink.close();
      this.closed = true;
      this.entries.length = 0;
      return { size: this.offset, count };
    }
    async abort() {
      this.closed = true;
      this.entries.length = 0;
      await this.sink.abort();
    }
  }
  async function createTarget() {
    let directory;
    try {
      if (root.navigator?.storage?.getDirectory) {
        const storage = await root.navigator.storage.getDirectory();
        directory = await storage.getDirectoryHandle("utv-segment-exports", {
          create: true,
        });
      }
    } catch (error) {
      // file:// and restricted origins can still stream into browser-backed
      // Blob parts. Do not mask disk/quota errors on a supported origin.
      if (!["SecurityError", "NotSupportedError"].includes(error.name))
        throw error;
    }
    if (directory) {
      const key = "segments-" + root.crypto.randomUUID() + ".zip";
      const file = await directory.getFileHandle(key, { create: true });
      let writable,
        closed = false,
        removed = false;
      const dispose = async () => {
        if (!removed) {
          await directory.removeEntry(key);
          removed = true;
        }
      };
      try {
        writable = await file.createWritable();
      } catch (error) {
        await dispose();
        throw error;
      }
      return {
        storage: "disk",
        write: (bytes) => writable.write(bytes),
        close: async () => {
          await writable.close();
          closed = true;
        },
        abort: async () => {
          if (!closed) await writable.abort().catch(() => {});
          await dispose();
        },
        result: async () => ({ blob: await file.getFile(), dispose }),
      };
    }
    // No network/service worker and no multi-download fallback, including the
    // standalone editor. The browser may spool Blob parts to temporary disk.
    const parts = [];
    let blob;
    return {
      storage: "blob",
      write: async (bytes) => {
        parts.push(new Blob([bytes]));
      },
      close: async () => {
        blob = new Blob(parts, { type: "application/zip" });
        parts.length = 0;
      },
      abort: async () => {
        parts.length = 0;
        blob = null;
      },
      result: async () => ({
        blob,
        dispose: async () => {
          blob = null;
        },
      }),
    };
  }
  const api = { ZipWriter, createTarget };
  root.UTStudio = Object.assign(root.UTStudio || {}, { Archive: api });
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
