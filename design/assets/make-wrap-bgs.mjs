// Abstract layered-gradient backgrounds for Wrapped slides (393x852).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const out = dirname(fileURLToPath(import.meta.url));
const W = 393, H = 852;

function bg(name, base, a, b, seed, cx, cy) {
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let defs = "", rects = "";
  for (let i = 0; i < 11; i++) {
    const w = 260 + rnd() * 380, h = 160 + rnd() * 320;
    const x = cx - w / 2 + (rnd() - 0.5) * 260, y = cy - h / 2 + (rnd() - 0.5) * 520;
    const rot = -50 + rnd() * 100;
    const g = `g${i}`, dir = rnd() > 0.5;
    defs += `<linearGradient id="${g}" x1="${dir ? 0 : 1}" y1="0" x2="${dir ? 1 : 0}" y2="1"><stop offset="0" stop-color="${i % 3 === 0 ? b : a}"/><stop offset=".55" stop-color="${i % 2 ? a : b}"/><stop offset="1" stop-color="${base}"/></linearGradient>`;
    rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#${g})" transform="rotate(${rot.toFixed(1)} ${(x + w / 2).toFixed(1)} ${(y + h / 2).toFixed(1)})"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs><rect width="${W}" height="${H}" fill="${base}"/>${rects}<rect width="${W}" height="${H}" fill="url(#shade)"/></svg>`;
  writeFileSync(join(out, `${name}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`);
}
bg("wbg-1", "#120208", "#FF2E93", "#E8221B", 11, 260, 380);
bg("wbg-2", "#0A0503", "#FF7A1A", "#FFD23F", 23, 120, 560);
bg("wbg-3", "#04061A", "#3D5BFF", "#B44DFF", 37, 280, 520);
bg("wbg-5", "#031006", "#2FE38A", "#D7FF3F", 51, 200, 600);
bg("wbg-6", "#06121A", "#00C2FF", "#3FD0B6", 67, 220, 300);
console.log("ok");
