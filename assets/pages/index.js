(function blockOutbound() {
  const deny = function () { throw new Error("Outbound network calls are disabled in UsefulTool."); };
  window.fetch = deny;
  window.XMLHttpRequest = deny;
  window.WebSocket = deny;
  window.EventSource = deny;
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return false; };
})();
document.querySelectorAll("[data-source]").forEach((button) => {
  button.addEventListener("click", () => {
    window.open("view-source:" + new URL(button.dataset.source, location.href).href, "_blank", "noopener,noreferrer");
  });
});
