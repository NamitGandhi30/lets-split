/**
 * Make the installed iPhone app behave like a native app, not a web page.
 *
 * 1. Height: in home-screen mode with a translucent status bar, recent iOS reports a viewport
 *    that's one status bar shorter than the screen, so the bottom of every screen shows a band.
 *    We size the app from the real screen height instead (falling back to the viewport when the
 *    keyboard is open, or in a normal browser tab).
 * 2. No pinch or double-tap zoom (iOS ignores user-scalable=no, so block its gesture events).
 */
export function installNativeShell() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const root = document.documentElement;

  const size = () => {
    const vh = window.innerHeight;
    let h = vh;
    if (standalone) {
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      const screenH = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
      // A keyboard shrinks the viewport by far more than a status bar: keep to the viewport then.
      const keyboardOpen = screenH - vh > 150;
      if (!keyboardOpen) h = Math.max(vh, screenH);
    }
    root.style.setProperty("--app-h", `${h}px`);
  };
  size();
  window.addEventListener("resize", size);
  window.addEventListener("orientationchange", () => setTimeout(size, 300));
  window.visualViewport?.addEventListener("resize", size);

  // iOS-only pinch events; preventing them stops page zoom.
  const block = (e: Event) => e.preventDefault();
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  // Two-finger touchmove can still zoom on some versions.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
