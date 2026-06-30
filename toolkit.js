(function lockOutboundRuntime() {
  const deny = function () { throw new Error("Outbound network calls are disabled in UsefulTool."); };
  window.fetch = deny;
  window.XMLHttpRequest = deny;
  window.WebSocket = deny;
  window.EventSource = deny;
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return false; };
})();

window.UsefulTool = {
  download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  status(element, message, mode) {
    element.textContent = message;
    element.className = "status" + (mode ? " " + mode : "");
  },
  bytesLabel(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KiB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MiB";
  }
};
