// Ambient weather layers for the Home header mockups (the app draws these live on a canvas).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = dirname(fileURLToPath(import.meta.url));
const W = 393, H = 420;
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const fade = `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".75" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>`;

function snow() {
  let s = "";
  for (let i = 0; i < 140; i++) {
    const r = 0.8 + rnd() * 2.6, o = 0.25 + rnd() * 0.65;
    s += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${o.toFixed(2)}"${r > 2.6 ? ' filter="url(#b)"' : ""}/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${fade}<filter id="b"><feGaussianBlur stdDeviation="0.8"/></filter></defs><g mask="url(#m)">${s}</g></svg>`;
}
function rain() {
  let s = "";
  for (let i = 0; i < 110; i++) {
    const x = rnd() * (W + 60) - 30, y = rnd() * H, len = 12 + rnd() * 20, o = 0.12 + rnd() * 0.3;
    s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - len * 0.28).toFixed(1)}" y2="${(y + len).toFixed(1)}" stroke="#BFD3FF" stroke-width="${(0.8 + rnd() * 0.8).toFixed(2)}" stroke-linecap="round" opacity="${o.toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${fade}</defs><g mask="url(#m)">${s}</g></svg>`;
}
function sun() {
  let motes = "";
  for (let i = 0; i < 40; i++) motes += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H * 0.8).toFixed(1)}" r="${(0.6 + rnd() * 1.4).toFixed(2)}" fill="#FFD9A0" opacity="${(0.15 + rnd() * 0.35).toFixed(2)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${fade}<radialGradient id="g" cx="0.92" cy="0.06" r="0.85"><stop offset="0" stop-color="#FFB547" stop-opacity=".55"/><stop offset=".35" stop-color="#FF8A3D" stop-opacity=".18"/><stop offset="1" stop-color="#FF8A3D" stop-opacity="0"/></radialGradient></defs><g mask="url(#m)"><rect width="${W}" height="${H}" fill="url(#g)"/>${motes}</g></svg>`;
}
function stars() {
  let s = "";
  for (let i = 0; i < 90; i++) s += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H * 0.85).toFixed(1)}" r="${(0.4 + rnd() * 1.2).toFixed(2)}" fill="#fff" opacity="${(0.2 + rnd() * 0.7).toFixed(2)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${fade}<radialGradient id="moon" cx="0.86" cy="0.12" r="0.35"><stop offset="0" stop-color="#C9D4FF" stop-opacity=".35"/><stop offset="1" stop-color="#C9D4FF" stop-opacity="0"/></radialGradient></defs><g mask="url(#m)"><rect width="${W}" height="${H}" fill="url(#moon)"/>${s}</g></svg>`;
}

const page = (svg) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`;
for (const [n, f] of [["wx-snow", snow], ["wx-rain", rain], ["wx-sun", sun], ["wx-stars", stars]]) writeFileSync(join(out, `${n}.html`), page(f()));

// small weather glyphs for the header chip
const glyph = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:24px;height:24px}</style></head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F2F3F5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg></body></html>`;
writeFileSync(join(out, "g-snow.html"), glyph('<path d="M12 2v20M4.9 7l14.2 10M19.1 7 4.9 17"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>'));
writeFileSync(join(out, "g-rain.html"), glyph('<path d="M7 15a4.5 4.5 0 1 1 1.2-8.8A6 6 0 0 1 19 9.5 3.5 3.5 0 0 1 17.5 16H7"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/>'));
writeFileSync(join(out, "g-sun.html"), glyph('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'));
writeFileSync(join(out, "g-moon.html"), glyph('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'));
console.log("ok");
