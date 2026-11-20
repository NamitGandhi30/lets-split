// Doodle-style avatars: black line art, spot colors (red / blue / yellow), blush cheeks.
// Original characters; the app ships these as an avatar picker next to "Add photo".
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = dirname(fileURLToPath(import.meta.url));
const INK = "#1A1A1A", R = "#E8392F", B = "#2257D6", Y = "#F5C518", BG = "#FFF7EC", BLUSH = "#F6A5A0";
const S = `stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;

const body = (fill = "none", extra = "") =>
  `<path d="M22 104 C24 85 36 77 50 77 C64 77 76 85 78 104 Z" fill="${fill}" ${S}/>${extra}`;
const neck = `<path d="M45 68 V77 M55 68 V77" ${S} fill="none"/>`;
const head = `<circle cx="50" cy="51" r="19" fill="#fff" ${S}/>`;
const face = (mouth = "smile") => {
  const m = mouth === "o" ? `<ellipse cx="50" cy="59" rx="2.2" ry="2.6" fill="${INK}"/>`
    : mouth === "flat" ? `<path d="M47.5 59 H52.5" ${S} fill="none"/>`
    : `<path d="M47.3 58 q2.7 2.6 5.4 0" ${S} fill="none"/>`;
  return `<circle cx="43.8" cy="52.5" r="1.9" fill="${INK}"/><circle cx="56.2" cy="52.5" r="1.9" fill="${INK}"/>
<ellipse cx="39.8" cy="57.6" rx="3.1" ry="1.8" fill="${BLUSH}" opacity=".8"/><ellipse cx="60.2" cy="57.6" rx="3.1" ry="1.8" fill="${BLUSH}" opacity=".8"/>${m}`;
};

export const doodles = {
  you: () => body(Y, `<path d="M44 78 L50 84 L56 78" ${S} fill="none"/>`) + neck + head +
    `<path d="M31 55 C29 35 39 30 50 30 C61 30 71 35 69 55 C67 47 63 42 58 40 C52 44 42 45 36 43 C33 46 32 50 31 55 Z" fill="${INK}" ${S}/>` + face("smile"),
  diya: () => body(B) + neck + `<circle cx="33" cy="36" r="7" fill="${INK}" ${S}/><circle cx="67" cy="36" r="7" fill="${INK}" ${S}/>` + head +
    `<path d="M32 47 C33 35 41 31 50 31 C59 31 67 35 68 47 C62 41 56 39 50 39 C44 39 38 41 32 47 Z" fill="${INK}" ${S}/>` + face("o"),
  kabir: () => body("none", `<path d="M42 78 L50 85 L58 78" ${S} fill="none"/>`) + neck + head +
    `<path d="M30 46 C30 31 40 27 50 27 C60 27 70 31 70 46 Z" fill="${B}" ${S}/><path d="M29 42 H71 V48 H29 Z" fill="${B}" ${S}/><circle cx="50" cy="24" r="4.6" fill="${B}" ${S}/>` + face("flat"),
  meera: () => body("none") + neck + head +
    `<path d="M28 57 C26 35 38 28 50 28 C62 28 74 35 72 57 L66 57 C66 49 64 45 62 43 C56 47 44 47 38 43 C36 45 34 49 34 57 Z" fill="${R}" ${S}/>` + face("smile"),
  rohan: () => body("none", `<path d="M30 90 H70 M27 97 H73" ${S} fill="none"/>`) + neck +
    `<circle cx="35" cy="35" r="6.5" fill="#fff" ${S}/><circle cx="65" cy="35" r="6.5" fill="#fff" ${S}/><circle cx="35" cy="35" r="2.6" fill="${BLUSH}"/><circle cx="65" cy="35" r="2.6" fill="${BLUSH}"/>` + head + face("o"),
  aanya: () => body("none") + `<path d="M44 76 L50 79.5 L44 83 Z M56 76 L50 79.5 L56 83 Z" fill="${Y}" ${S}/>` + neck +
    [-150, -120, -90, -60, -30].map((a) => { const r = (a * Math.PI) / 180; return `<path d="M${(50 + Math.cos(r) * 24).toFixed(1)} ${(51 + Math.sin(r) * 24).toFixed(1)} L${(50 + Math.cos(r) * 30).toFixed(1)} ${(51 + Math.sin(r) * 30).toFixed(1)}" stroke="${Y}" stroke-width="2.8" stroke-linecap="round"/>`; }).join("") +
    `<circle cx="50" cy="51" r="19" fill="#fff" stroke="${Y}" stroke-width="2.8"/>` + face("smile"),
  dev: () => body(B) + neck + head +
    `<path d="M31 49 L33 35 L38 40 L41 31 L46 37 L50 29 L54 37 L59 31 L62 40 L67 35 L69 49 C64 43 57 41 50 41 C43 41 36 43 31 49 Z" fill="${INK}" ${S}/>` + face("smile"),
  isha: () => body(INK) + neck + head +
    `<path d="M31 72 C27 52 30 31 50 31 C70 31 73 52 69 72" fill="none" ${S}/><path d="M50 32 C48 39 44 43 37 45 M50 32 C53 38 57 42 63 44" fill="none" ${S}/>` + face("flat"),
};

const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${BG}"/>${inner}</svg>`;
const page = (s, w, h) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${s}</body></html>`;
for (const [k, f] of Object.entries(doodles)) writeFileSync(join(out, `dd-${k}.html`), page(svg(f()), 96, 96));

// Split ring with doodle pins
const polar = (cx, cy, r, d) => { const a = ((d - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
let segs = "", pins = "", acc = 0;
for (const [k, c] of [["you", "#141518"], ["diya", "#3D5BFF"], ["kabir", "#F4E22C"], ["meera", "#A9B8FF"]]) {
  const a0 = acc + 15, a1 = acc + 75;
  segs += `<path d="${arc(130, 130, 100, a0, a1)}" fill="none" stroke="${c}" stroke-width="28" stroke-linecap="round"/>`;
  const [x, y] = polar(130, 130, 100, a1);
  pins += `<g transform="translate(${(x - 22).toFixed(2)} ${(y - 22).toFixed(2)})"><defs><clipPath id="p${k}"><circle cx="22" cy="22" r="20"/></clipPath></defs><circle cx="22" cy="22" r="23" fill="#fff"/><g clip-path="url(#p${k})"><svg width="44" height="44" viewBox="0 0 100 100"><rect width="100" height="100" fill="${BG}"/>${doodles[k]()}</svg></g><circle cx="22" cy="22" r="20" fill="none" stroke="${INK}" stroke-width="1.5"/></g>`;
  acc += 90;
}
writeFileSync(join(out, "ring-doodles.html"), page(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260"><circle cx="130" cy="130" r="100" fill="none" stroke="#F1F3FA" stroke-width="28"/>${segs}${pins}</svg>`, 260, 260));

// Contact sheet for review
writeFileSync(join(out, "dd-sheet.html"), page(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 220">${Object.values(doodles).map((f, i) => `<svg x="${(i % 4) * 110}" y="${Math.floor(i / 4) * 110}" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="${BG}"/>${f()}</svg>`).join("")}</svg>`, 440, 220));
console.log(Object.keys(doodles).join(","));
