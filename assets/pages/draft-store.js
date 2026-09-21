/* Independent keys keep a stale tab from replacing another tab's drafts. */
(function (root) {
  const key = "usefultool:text-editor:drafts";
  const prefix = key + ":";
  function read() {
    let old;
    try { old = JSON.parse(localStorage.getItem(key) || "[]"); } catch { old = []; }
    const records = new Map((Array.isArray(old) ? old : []).map(d => [d.id, d]));
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index);
      if (!name?.startsWith(prefix)) continue;
      try {
        const record = JSON.parse(localStorage.getItem(name));
        const id = name.slice(prefix.length);
        if (record === null) records.delete(id);
        else if (record?.id === id) records.set(id, record);
      } catch { /* A malformed record must not hide the other drafts. */ }
    }
    return [...records.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  function write(draft, initialize = false) {
    if (initialize && localStorage.getItem(prefix + draft.id) !== null) return;
    localStorage.setItem(prefix + draft.id, JSON.stringify(draft));
  }
  function remove(id) {
    // Tombstones prevent old open tabs and old collection snapshots reviving it.
    localStorage.setItem(prefix + id, "null");
  }
  root.UsefulToolDraftStore = { read, write, remove };
})(globalThis);
