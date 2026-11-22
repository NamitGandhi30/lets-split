/**
 * Raise the keyboard for a field that is still sliding in.
 *
 * Focusing a field while its sheet or page is off screen makes iOS scroll toward it, and that
 * scroll fights the slide (a black half-screen under sheets, a shaking page on push). iOS only
 * shows the keyboard for focus inside the tap, so during the tap we focus an invisible stand-in
 * that is already on screen, then hand focus to the real field once it has landed.
 */
let proxy: HTMLInputElement | null = null;

export function holdKeyboard() {
  if (!proxy) {
    proxy = document.createElement("input");
    proxy.setAttribute("aria-hidden", "true");
    proxy.tabIndex = -1;
    // 16px so iOS doesn't zoom; body is position:fixed, so top:0 is always on screen.
    proxy.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;pointer-events:none";
    document.body.appendChild(proxy);
  }
  proxy.focus({ preventScroll: true });
}

/** Move focus to the field once it's in place, unless the user has already focused something. */
export function handKeyboardTo(el: HTMLElement | null | undefined) {
  if (!el) return;
  const active = document.activeElement;
  if (active === proxy || active === document.body || active == null) el.focus({ preventScroll: true });
}
