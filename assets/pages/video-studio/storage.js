/* Autosaves and media blobs are isolated per browser tab; .utvproj contains only portable data. */
(function (root) {
  "use strict";
  const M = root.UTStudio.Model;
  const request = (operation) => new Promise((resolve, reject) => { operation.onsuccess = () => resolve(operation.result); operation.onerror = () => reject(operation.error); });
  class SessionStore {
    constructor(onStatus = () => {}) {
      this.onStatus = onStatus; this.timer = null; this.latest = null; this.queue = Promise.resolve(); this.db = null;
      try { this.key = sessionStorage.getItem("utvstudio-session") || M.id("session"); sessionStorage.setItem("utvstudio-session", this.key); }
      catch { this.key = M.id("session"); }
    }
    async open() {
      if (this.db) return this.db;
      if (!root.indexedDB) throw new Error("Session recovery is unavailable here. Use Save project before refreshing.");
      const operation = indexedDB.open("usefultool-timeline-studio", 1);
      operation.onupgradeneeded = () => {
        const db = operation.result;
        db.createObjectStore("projects"); db.createObjectStore("files");
      };
      this.db = await request(operation);
      this.db.onversionchange = () => { this.db.close(); this.db = null; };
      return this.db;
    }
    async transact(storeName, mode, action) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode), operation = action(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(operation?.result);
        tx.onerror = () => reject(tx.error || new Error("The browser could not save this session."));
        tx.onabort = () => reject(tx.error || new Error("Session save was interrupted."));
      });
    }
    async putFile(descriptor, file) {
      return this.transact("files", "readwrite", (store) => store.put({ blob: file, name: file.name, type: file.type, modified: file.lastModified }, this.key + ":" + descriptor.id));
    }
    async getFile(descriptor) {
      const entry = await this.transact("files", "readonly", (store) => store.get(this.key + ":" + descriptor.id));
      return entry ? new File([entry.blob], entry.name, { type: entry.type, lastModified: entry.modified }) : null;
    }
    schedule(project) {
      const json = M.serialize(project);
      M.parseProject(json);
      this.latest = json; clearTimeout(this.timer); this.onStatus("Saving");
      this.timer = setTimeout(() => { this.flush().catch(() => {}); }, 500);
    }
    async flush() {
      clearTimeout(this.timer);
      if (!this.latest) return this.queue;
      const json = this.latest; this.latest = null;
      const save = this.queue.catch(() => {}).then(() => this.transact("projects", "readwrite", (store) => {
        const read = store.get(this.key);
        read.onsuccess = () => {
          let previous;
          for (const candidate of [read.result?.json, read.result?.previous]) {
            if (!candidate) continue;
            try { M.parseProject(candidate); previous = candidate; break; } catch {}
          }
          store.put({ json, previous, savedAt: Date.now() }, this.key);
        };
        return read;
      }));
      this.queue = save;
      try { await save; if (!this.latest) this.onStatus("Saved on this device"); }
      catch (error) { this.onStatus("Could not save on this device", error); throw error; }
    }
    async load() {
      const saved = await this.transact("projects", "readonly", (store) => store.get(this.key));
      this.recoveryMessage = "";
      if (!saved) return null;
      try { return M.parseProject(saved.json); }
      catch (error) {
        // Keep the invalid snapshot untouched until the user continues. Prefer
        // repairing its known effect inversion so unrelated later edits survive.
        try {
          const repaired = M.recoverEffectRanges(saved.json);
          this.recoveryMessage = "Recovered invalid effect timing. Review the effect start and end times.";
          return repaired;
        } catch {}
        if (saved.previous) {
          const previous = M.parseProject(saved.previous);
          this.recoveryMessage = "The latest session was invalid. Recovered the previous valid save.";
          return previous;
        }
        throw error;
      }
    }
    async restore(project, library) {
      const missing = [];
      for (const descriptor of project.assets) {
        if (library.has(descriptor.id)) continue;
        const file = await this.getFile(descriptor);
        if (file) { try { await library.attach(descriptor, file); } catch { missing.push(descriptor); } }
        else missing.push(descriptor);
      }
      return missing;
    }
    async clear() {
      clearTimeout(this.timer); await this.queue.catch(() => {});
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["projects", "files"], "readwrite"), range = IDBKeyRange.bound(this.key + ":", this.key + ":\uffff");
        tx.objectStore("projects").delete(this.key);
        tx.objectStore("files").delete(range); tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || new Error("Could not clear this session. Your current project is still available."));
      });
      this.latest = null;
    }
  }
  root.UTStudio.SessionStore = SessionStore;
})(globalThis);
