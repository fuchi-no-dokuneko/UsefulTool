window.T = {
  checks: [], errors: [], tests: [],
  check(name, passed) {
    this.checks.push({ name, passed: !!passed });
    if (!passed) throw new Error(name);
  },
  delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
  async wait(fn) {
    for (let n = 0; n < 500; n++) { if (fn()) return; await this.delay(20); }
    throw new Error('Timed out waiting for tool UI');
  },
  async frame(page) {
    const frame = document.createElement('iframe');
    frame.width = '1250'; frame.height = '800';
    const ready = new Promise(resolve => frame.onload = resolve);
    frame.src = '/' + page + '.html'; document.body.append(frame); await ready;
    const w = frame.contentWindow;
    w.addEventListener('error', e => this.errors.push(e.message));
    w.addEventListener('unhandledrejection', e => this.errors.push(String(e.reason)));
    return { w, d: w.document, frame };
  },
  input(w, node, files) {
    const transfer = new w.DataTransfer();
    files.forEach(file => transfer.items.add(file)); node.files = transfer.files;
    node.dispatchEvent(new w.Event('change', { bubbles: true }));
  },
  async upload(name, blob) {
    const response = await fetch('/__video-studio-test__/' + name, { method: 'POST', body: blob });
    if (!response.ok) throw new Error('Could not save ' + name);
  }
};
