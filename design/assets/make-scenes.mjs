// Destination scenes for the Home header (393x420). The app renders these as layered SVG/canvas
// with particles animated on top; here they're flattened to PNG for the Figma mockups.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = dirname(fileURLToPath(import.meta.url));
const W = 393, H = 420;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function ridge(baseY, amp, step, jag) {
  let x = -10, d = `M-10 ${H} L-10 ${baseY}`;
  const peaks = [];
  while (x < W + 20) {
    const nx = x + step * (0.6 + rnd() * 0.8);
    const py = baseY - amp * (0.35 + rnd() * 0.65);
    const mx = (x + nx) / 2 + (rnd() - 0.5) * jag;
    d += ` L${mx.toFixed(1)} ${py.toFixed(1)} L${nx.toFixed(1)} ${(baseY - rnd() * amp * 0.25).toFixed(1)}`;
    peaks.push([mx, py]);
    x = nx;
  }
  return { d: d + ` L${W + 20} ${H} Z`, peaks };
}
const cap = ([x, y], w, c, o) => `<path d="M${(x - w).toFixed(1)} ${(y + w * 0.9).toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)} L${(x + w).toFixed(1)} ${(y + w * 0.9).toFixed(1)} L${(x + w * 0.4).toFixed(1)} ${(y + w * 0.6).toFixed(1)} L${x.toFixed(1)} ${(y + w * 0.85).toFixed(1)} L${(x - w * 0.45).toFixed(1)} ${(y + w * 0.55).toFixed(1)} Z" fill="${c}" opacity="${o}"/>`;

function mountains() {
  seed = 21;
  const far = ridge(250, 100, 125, 20), mid = ridge(305, 95, 150, 30), near = ridge(372, 60, 170, 30);
  let snow = "";
  for (let i = 0; i < 70; i++) snow += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${(0.5 + rnd() * 0.8).toFixed(2)}" fill="#E8EEFF" opacity="${(0.25 + rnd() * 0.35).toFixed(2)}"/>`;
  for (let i = 0; i < 26; i++) snow += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${(1.4 + rnd() * 0.9).toFixed(2)}" fill="#F2F5FF" opacity="${(0.45 + rnd() * 0.3).toFixed(2)}"/>`;
  for (let i = 0; i < 7; i++) snow += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H * 0.9).toFixed(1)}" r="${(4 + rnd() * 4).toFixed(1)}" fill="#F2F5FF" opacity="${(0.12 + rnd() * 0.12).toFixed(2)}" filter="url(#bokeh)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0F12"/><stop offset=".55" stop-color="#121B2B"/><stop offset="1" stop-color="#1A2740"/></linearGradient>
<radialGradient id="moon" cx="0.77" cy="0.36" r="0.4"><stop offset="0" stop-color="#AFC2FF" stop-opacity=".22"/><stop offset="1" stop-color="#AFC2FF" stop-opacity="0"/></radialGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0F12" stop-opacity="0"/><stop offset="1" stop-color="#0E0F12" stop-opacity=".55"/></linearGradient>
<filter id="bokeh"><feGaussianBlur stdDeviation="2.2"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/><rect width="${W}" height="${H}" fill="url(#moon)"/>
<circle cx="304" cy="150" r="15" fill="#E3EAFF" opacity=".9"/><circle cx="310" cy="146" r="13" fill="#141D2E" opacity=".9"/>
<path d="${far.d}" fill="#1D2B44"/>${far.peaks.map((p) => cap(p, 13, "#C7D3EC", 0.28)).join("")}
<path d="${mid.d}" fill="#16223A"/>${mid.peaks.map((p) => cap(p, 16, "#DCE5F7", 0.32)).join("")}
<path d="${near.d}" fill="#101828"/>
<rect width="${W}" height="${H}" fill="url(#fade)"/>${snow}</svg>`;
}

function beach() {
  seed = 33;
  let stars = "";
  for (let i = 0; i < 28; i++) stars += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * 130).toFixed(1)}" r="${(0.4 + rnd() * 0.8).toFixed(2)}" fill="#fff" opacity="${(0.2 + rnd() * 0.5).toFixed(2)}"/>`;
  let streaks = "";
  for (let i = 0; i < 9; i++) {
    const y = 318 + i * 9, w = 46 - i * 3.4 + rnd() * 10;
    streaks += `<rect x="${(262 - w / 2 + (rnd() - 0.5) * 8).toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="2.6" rx="1.3" fill="#FFB27A" opacity="${(0.75 - i * 0.07).toFixed(2)}"/>`;
  }
  let waves = "";
  for (let i = 0; i < 4; i++) {
    const y = 336 + i * 20;
    waves += `<path d="M-10 ${y} Q 50 ${y - 5} 100 ${y} T 200 ${y} T 300 ${y} T 410 ${y}" fill="none" stroke="#FFFFFF" stroke-width="1.2" opacity="${0.1 - i * 0.015}"/>`;
  }
  const frond = (a, len) => {
    const r = (a * Math.PI) / 180, x1 = 352 + Math.cos(r) * len, y1 = 226 + Math.sin(r) * len;
    const cx = 352 + Math.cos(r - 0.35) * len * 0.6, cy = 226 + Math.sin(r - 0.35) * len * 0.6 - 10;
    return `<path d="M352 226 Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${(cx + 6).toFixed(1)} ${(cy + 12).toFixed(1)} 352 230 Z" fill="#0A0A10"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0F12"/><stop offset=".38" stop-color="#1B1838"/><stop offset=".62" stop-color="#4A2550"/><stop offset=".76" stop-color="#C0566A"/><stop offset=".78" stop-color="#FF8A5B"/></linearGradient>
<radialGradient id="glow" cx="0.67" cy="0.74" r="0.55"><stop offset="0" stop-color="#FF9E6B" stop-opacity=".55"/><stop offset="1" stop-color="#FF9E6B" stop-opacity="0"/></radialGradient>
<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE0A8"/><stop offset="1" stop-color="#FF8A5B"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B2348"/><stop offset=".5" stop-color="#1E1A33"/><stop offset="1" stop-color="#121420"/></linearGradient>
<clipPath id="above"><rect width="${W}" height="314"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars}<rect width="${W}" height="${H}" fill="url(#glow)"/>
<circle cx="262" cy="314" r="36" fill="url(#sun)" clip-path="url(#above)"/>
<rect y="314" width="${W}" height="${H - 314}" fill="url(#sea)"/>${streaks}${waves}
<path d="M352 420 C 356 360 350 290 352 226" stroke="#0A0A10" stroke-width="6" fill="none" stroke-linecap="round"/>
${[200, 225, 250, 290, 320, 345, 165].map((a, i) => frond(a, 46 + (i % 3) * 8)).join("")}
<path d="M-10 420 L-10 396 Q 120 380 240 400 T 410 392 L410 420 Z" fill="#0E0F12" opacity=".7"/></svg>`;
}

function desert() {
  seed = 45;
  let motes = "";
  for (let i = 0; i < 36; i++) motes += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * 300).toFixed(1)}" r="${(0.6 + rnd() * 1.2).toFixed(2)}" fill="#FFD9A0" opacity="${(0.15 + rnd() * 0.3).toFixed(2)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0F12"/><stop offset=".55" stop-color="#2A1A12"/><stop offset="1" stop-color="#5A3218"/></linearGradient>
<radialGradient id="sunglow" cx="0.78" cy="0.36" r="0.6"><stop offset="0" stop-color="#FFB547" stop-opacity=".5"/><stop offset=".4" stop-color="#FF8A3D" stop-opacity=".15"/><stop offset="1" stop-color="#FF8A3D" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/><rect width="${W}" height="${H}" fill="url(#sunglow)"/>
<circle cx="306" cy="150" r="24" fill="#FFC56B" opacity=".85"/>${motes}
<path d="M-10 420 L-10 280 C 80 250 150 300 230 270 S 360 240 410 262 L410 420 Z" fill="#3A2416"/>
<path d="M-10 420 L-10 330 C 70 300 170 350 260 318 S 380 300 410 316 L410 420 Z" fill="#2B1A10"/>
<path d="M-10 420 L-10 372 C 90 350 190 390 300 362 S 390 356 410 362 L410 420 Z" fill="#1C120B"/>
<path d="M40 300 q 10 -4 20 0 t 20 0 M210 286 q 10 -4 20 0 t 20 0" stroke="#FFC56B" stroke-width="1" fill="none" opacity=".18"/></svg>`;
}

const page = (svg) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`;
for (const [n, f] of [["scene-mountains", mountains], ["scene-beach", beach], ["scene-desert", desert]]) writeFileSync(join(out, `${n}.html`), page(f()));
console.log("ok");
