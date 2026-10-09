// Installs the service worker, shows an install button when the browser offers
// one, and a banner when a new version is waiting (#177). Pages opt in with
// <button id="install" hidden> and by dispatching "langchange" on document.
(() => {
  const TEXT = {
    fa: { install: "نصب", update: "نسخهٔ جدید آماده است.", reload: "به‌روزرسانی" },
    en: { install: "Install", update: "A new version is available.", reload: "Update" },
  };
  const t = () => TEXT[document.documentElement.lang === "fa" ? "fa" : "en"];

  const installButton = document.getElementById("install");
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });
  installButton?.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener("appinstalled", () => installButton && (installButton.hidden = true));

  const banner = document.createElement("div");
  banner.className = "update-banner";
  banner.setAttribute("role", "status");
  banner.hidden = true;
  banner.innerHTML = '<span></span><button type="button"></button>';
  document.body.append(banner);

  function renderText() {
    if (installButton) installButton.textContent = t().install;
    banner.querySelector("span").textContent = t().update;
    banner.querySelector("button").textContent = t().reload;
  }
  document.addEventListener("langchange", renderText);
  renderText();

  if (!("serviceWorker" in navigator)) return;

  let waiting = null;
  const offer = (worker) => {
    // The first install has nothing to update from
    if (!worker || !navigator.serviceWorker.controller) return;
    waiting = worker;
    banner.hidden = false;
    document.body.classList.add("has-update");
  };
  // Reload only for an update the user asked for: the first install also
  // fires controllerchange (clients.claim), and reloading then made every
  // first visit load twice
  let updating = false;
  banner.querySelector("button").addEventListener("click", () => {
    updating = true;
    waiting?.postMessage("skip-waiting");
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updating) return;
    updating = false;
    location.reload();
  });

  navigator.serviceWorker.register("/sw.js").then((registration) => {
    offer(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => worker.state === "installed" && offer(worker));
    });
    // Pages like the dashboard stay open for days; look for a new deploy hourly
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  });
})();
