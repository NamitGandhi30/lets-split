import { registerSW } from "virtual:pwa-register";

/**
 * Keep the installed iPhone app on the latest build. iOS is lazy about updating home-screen
 * service workers, so besides the normal service-worker update we ask the server which build is
 * live (/version.json, never cached). If it differs from ours, we drop the old service worker and
 * its caches and reload into the new build. Checked at launch and whenever the app comes back to
 * the foreground.
 */
export function keepUpToDate() {
  let reg: ServiceWorkerRegistration | undefined;
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      reg = r;
    },
  });

  let checking = false;
  async function check() {
    if (checking || !navigator.onLine) return;
    checking = true;
    try {
      reg?.update().catch(() => {});
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const { build } = (await res.json()) as { build?: string };
      if (!build || build === __BUILD_ID__) return;
      // Avoid a reload loop if the new build somehow reports the old id.
      const key = "lets-split-reloaded-for";
      if (sessionStorage.getItem(key) === build) return;
      sessionStorage.setItem(key, build);
      await hardRefresh(updateSW);
    } catch {
      /* offline or blocked: try again next time */
    } finally {
      checking = false;
    }
  }

  check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("online", check);
  setInterval(check, 30 * 60_000);
}

async function hardRefresh(updateSW: (reload?: boolean) => Promise<void>) {
  try {
    await updateSW(false);
  } catch {
    /* ignore */
  }
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    // Unregistering would also delete the lock screen notification subscription, so keep a
    // worker that has one. Clearing its caches below is enough for the reload to fetch the new build.
    await Promise.all(
      regs.map(async (r) => {
        const sub = await r.pushManager?.getSubscription().catch(() => null);
        if (!sub) await r.unregister();
      }),
    );
    if ("caches" in window) {
      const names = await caches.keys();
      // Only the service worker's app-shell caches; the data cache lives in localStorage.
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    /* ignore */
  }
  window.location.reload();
}
