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
  // Old-style "Add to Home Screen" apps may not match (display-mode: standalone); see index.css.
  if (standalone) root.classList.add("standalone");

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

  startAnimationsWhenDrawn();

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

/**
 * Start GPU animations on the frame they're first drawn, not when JavaScript created them.
 *
 * Motion back-dates every compositor animation to the moment it was triggered. On an iPhone the
 * new screen then spends a few hundred ms in effects, layout and paint before its first frame, so
 * by the time anything is visible a spring is half over and the push, pop or sheet looks like it
 * snapped into place. Left alone, the Web Animations API waits ("pending") and starts the clock on
 * the frame the animation is actually committed, so screens animated together still start
 * together. Only the back-dating of a not-yet-started animation is skipped; later seeks pass.
 */
function startAnimationsWhenDrawn() {
  if (typeof Animation === "undefined") return;
  const startTime = Object.getOwnPropertyDescriptor(Animation.prototype, "startTime");
  if (!startTime?.get || !startTime.set || !("pending" in Animation.prototype)) return;
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
    const anim = nativeAnimate.apply(this, args);
    Object.defineProperty(anim, "startTime", {
      configurable: true,
      get: () => startTime.get!.call(anim),
      set: (v: CSSNumberish | null) => {
        if (!anim.pending) startTime.set!.call(anim, v);
      },
    });
    return anim;
  };
}
