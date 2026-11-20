// Generates chart SVG/HTML for Figma image fills (Figma's plugin bridge can't draw arcs or curves).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = dirname(fileURLToPath(import.meta.url));
const polar = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

// --- split ring: 4 people, equal shares ---
function ring() {
  const people = [
    { c: "#141518", t: "#fff", i: "N" },
    { c: "#3D5BFF", t: "#fff", i: "D" },
    { c: "#F4E22C", t: "#141518", i: "K" },
    { c: "#A9B8FF", t: "#141518", i: "M" },
  ];
  const cx = 130, cy = 130, r = 100, sw = 28, gap = 30;
  let acc = 0, segs = "", pins = "";
  for (const p of people) {
    const sweep = 360 / people.length;
    const a0 = acc + gap / 2, a1 = acc + sweep - gap / 2;
    segs += `<path d="${arc(cx, cy, r, a0, a1)}" fill="none" stroke="${p.c}" stroke-width="${sw}" stroke-linecap="round"/>`;
    const [x, y] = polar(cx, cy, r, a1);
    pins += `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><circle r="18" fill="${p.c}" stroke="#fff" stroke-width="4"/><text text-anchor="middle" dy="5" font-family="Geist, Segoe UI, sans-serif" font-weight="700" font-size="14" fill="${p.t}">${p.i}</text></g>`;
    acc += sweep;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#F1F3FA" stroke-width="${sw}"/>${segs}${pins}</svg>`;
}

// --- petal bloom: trip spend by category ---
function bloom() {
  const cats = [
    ["#2F6B4F", 1680000], ["#F28C38", 1124000], ["#3A7BD5", 964000], ["#E2557A", 642000],
    ["#8E5BD9", 286000], ["#D9B52B", 124000], ["#9AA59D", 76000],
  ];
  const amax = Math.max(...cats.map((c) => c[1]));
  let petals = "";
  cats.forEach(([c, a], i) => {
    const L = 74 + 66 * Math.sqrt(a / amax), w = 36 + 8 * Math.sqrt(a / amax);
    const ang = (i * 360) / cats.length;
    petals += `<g transform="translate(150 150) rotate(${ang})"><path d="M0 0 C${w} ${-L * 0.22} ${w * 1.05} ${-L} 0 ${-L} C${-w * 1.05} ${-L} ${-w} ${-L * 0.22} 0 0Z" fill="${c}" fill-opacity="0.94"/></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">${petals}<circle cx="150" cy="150" r="56" fill="#fff"/></svg>`;
}

// --- wave line for Trip Wrapped/daily spend ---
function spark() {
  const vals = [3.2, 5.8, 4.1, 7.9, 6.2, 9.4, 5.1, 4.4, 2.9];
  const W = 330, H = 120, max = 10;
  const pts = vals.map((v, i) => [10 + (i * (W - 20)) / (vals.length - 1), H - 12 - (v / max) * (H - 30)]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  const area = `${d} L${pts.at(-1)[0]} ${H} L${pts[0][0]} ${H} Z`;
  const peak = pts[5];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FD0B6" stop-opacity=".35"/><stop offset="1" stop-color="#3FD0B6" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#g)"/><path d="${d}" fill="none" stroke="#3FD0B6" stroke-width="3" stroke-linecap="round"/><circle cx="${peak[0]}" cy="${peak[1]}" r="6" fill="#0E0F12" stroke="#3FD0B6" stroke-width="3"/></svg>`;
}

// --- mock QR (visual placeholder for the design; the app generates a real UPI QR) ---
function qr() {
  const N = 29, s = 8, pad = 16;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  let cells = "";
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (finder(r, c)) continue;
    if (rnd() > 0.52) cells += `<rect x="${pad + c * s}" y="${pad + r * s}" width="${s}" height="${s}" rx="1.5"/>`;
  }
  const fp = (r, c) => {
    const x = pad + c * s, y = pad + r * s;
    return `<rect x="${x}" y="${y}" width="${7 * s}" height="${7 * s}" rx="12" fill="#0E0F12"/><rect x="${x + s}" y="${y + s}" width="${5 * s}" height="${5 * s}" rx="8" fill="#fff"/><rect x="${x + 2 * s}" y="${y + 2 * s}" width="${3 * s}" height="${3 * s}" rx="5" fill="#0E0F12"/>`;
  };
  const W = N * s + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" rx="24" fill="#fff"/><g fill="#0E0F12">${cells}</g>${fp(0, 0)}${fp(0, N - 7)}${fp(N - 7, 0)}</svg>`;
}

const page = (svg, w, h) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`;

for (const [name, svg, w, h] of [["ring", ring(), 260, 260], ["bloom", bloom(), 300, 300], ["spark", spark(), 330, 120], ["qr", qr(), 264, 264]]) {
  writeFileSync(join(out, `${name}.svg`), svg);
  writeFileSync(join(out, `${name}.html`), page(svg, w, h));
}
console.log("ok");
