/** One burst of paper confetti from a point (the prototype's Save celebration). No-op with Reduce Motion. */
export function confetti(origin?: { x: number; y: number }) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  Object.assign(cv.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "70" });
  document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (cv.width = window.innerWidth * dpr);
  const H = (cv.height = window.innerHeight * dpr);
  const ctx = cv.getContext("2d");
  if (!ctx) return cv.remove();
  const ox = (origin?.x ?? window.innerWidth / 2) * dpr;
  const oy = (origin?.y ?? window.innerHeight * 0.38) * dpr;
  const cols = ["#3D5BFF", "#F4E22C", "#E8392F", "#3FD0B6", "#FF8A5B", "#ffffff"];
  const s = dpr / 2;
  const ps = Array.from({ length: 140 }, () => ({
    x: ox, y: oy,
    vx: (Math.random() - 0.5) * 26 * s, vy: (-Math.random() * 30 - 8) * s,
    r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
    w: (8 + Math.random() * 10) * s, h: (5 + Math.random() * 6) * s,
    c: cols[Math.floor(Math.random() * cols.length)]!,
  }));
  let f = 0;
  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.9 * s; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (++f < 110) requestAnimationFrame(tick);
    else cv.remove();
  };
  requestAnimationFrame(tick);
}
