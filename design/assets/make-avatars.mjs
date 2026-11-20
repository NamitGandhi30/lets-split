// Illustrated face avatars (one per person) used instead of initials, plus the split ring
// redrawn with avatar pins. In the app, people can pick one of these or upload a photo.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = dirname(fileURLToPath(import.meta.url));
export const people = {
  you:   { bg: "#F4E22C", fg: "#141518", rot: -8,  mouth: "smile", tx: 4,  ty: 6 },
  diya:  { bg: "#3D5BFF", fg: "#A9C4FF", rot: 12,  mouth: "open",  tx: -5, ty: 4 },
  kabir: { bg: "#FF8A5B", fg: "#2A1208", rot: -14, mouth: "flat",  tx: 6,  ty: 8 },
  meera: { bg: "#A9B8FF", fg: "#26308C", rot: 9,   mouth: "smile", tx: -3, ty: 5 },
  rohan: { bg: "#3FD0B6", fg: "#0A3B33", rot: -4,  mouth: "open",  tx: 3,  ty: 7 },
  aanya: { bg: "#E2557A", fg: "#FFD6E1", rot: 16,  mouth: "smile", tx: -6, ty: 3 },
  dev:   { bg: "#141518", fg: "#F4E22C", rot: -10, mouth: "flat",  tx: 5,  ty: 6 },
  isha:  { bg: "#F28C38", fg: "#2F2410", rot: 6,   mouth: "open",  tx: -2, ty: 8 },
};

// Face drawn in a 36x36 box (boring-avatars "beam" style, simplified).
export function face(p, id) {
  const m = p.mouth === "smile"
    ? `<path d="M15 ${21 + p.ty * 0.2} c1.6 2 4.4 2 6 0" stroke="${p.bg}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
    : p.mouth === "open"
      ? `<ellipse cx="18" cy="${21.5 + p.ty * 0.2}" rx="2.6" ry="1.9" fill="${p.bg}"/>`
      : `<path d="M15.2 ${21.5 + p.ty * 0.2} h5.6" stroke="${p.bg}" stroke-width="1.6" stroke-linecap="round"/>`;
  return `<defs><clipPath id="c${id}"><circle cx="18" cy="18" r="18"/></clipPath></defs>
<g clip-path="url(#c${id})"><rect width="36" height="36" fill="${p.bg}"/>
<g transform="translate(${p.tx} ${p.ty}) rotate(${p.rot} 18 18)"><rect x="4" y="4" width="28" height="28" rx="14" fill="${p.fg}"/></g>
<g transform="translate(${p.tx * 0.5} ${p.ty * 0.4})"><ellipse cx="14.5" cy="16.5" rx="1.5" ry="2" fill="${p.bg}"/><ellipse cx="21.5" cy="16.5" rx="1.5" ry="2" fill="${p.bg}"/>${m}</g></g>`;
}

const page = (svg, w, h) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`;
for (const [k, p] of Object.entries(people)) {
  writeFileSync(join(out, `av-${k}.html`), page(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">${face(p, k)}</svg>`, 96, 96));
}

// Split ring with avatar pins.
const polar = (cx, cy, r, d) => { const a = ((d - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
const ringPeople = [["you", "#141518"], ["diya", "#3D5BFF"], ["kabir", "#F4E22C"], ["meera", "#A9B8FF"]];
let segs = "", pins = "", acc = 0;
const cx = 130, cy = 130, r = 100, gap = 30;
for (const [k, c] of ringPeople) {
  const a0 = acc + gap / 2, a1 = acc + 90 - gap / 2;
  segs += `<path d="${arc(cx, cy, r, a0, a1)}" fill="none" stroke="${c}" stroke-width="28" stroke-linecap="round"/>`;
  const [x, y] = polar(cx, cy, r, a1);
  pins += `<g transform="translate(${(x - 20).toFixed(2)} ${(y - 20).toFixed(2)})"><circle cx="20" cy="20" r="21.5" fill="#fff"/><svg x="2" y="2" width="36" height="36" viewBox="0 0 36 36">${face(people[k], "r" + k)}</svg></g>`;
  acc += 90;
}
writeFileSync(join(out, "ring-avatars.html"), page(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260"><circle cx="130" cy="130" r="100" fill="none" stroke="#F1F3FA" stroke-width="28"/>${segs}${pins}</svg>`, 260, 260));
console.log(Object.keys(people).join(","));
