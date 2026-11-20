// Renders the app icon (split ring in the three trip accents on dark chrome) to PNGs with headless Edge/Chrome.
// Usage: pnpm --filter @lets-split/web gen:icons   (set BROWSER=path/to/chrome to override)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pub = fileURLToPath(new URL("../public/", import.meta.url));
mkdirSync(join(pub, "icons"), { recursive: true });

const polar = (r, d) => {
  const a = ((d - 90) * Math.PI) / 180;
  return [256 + r * Math.cos(a), 256 + r * Math.sin(a)];
};
const arc = (r, a0, a1) => {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

/** scale < 1 shrinks the mark to sit inside the maskable safe zone. */
const icon = (scale = 1, rounded = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="#0E0F12"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="none" stroke-width="62" stroke-linecap="round">
    <path d="${arc(140, 18, 102)}" stroke="#F4D23C"/>
    <path d="${arc(140, 138, 222)}" stroke="#3FD0B6"/>
    <path d="${arc(140, 258, 342)}" stroke="#5C8DFF"/>
  </g>
  <circle cx="256" cy="256" r="${30 * scale}" fill="#F2F3F5"/>
</svg>`;

writeFileSync(join(pub, "favicon.svg"), icon(1, true));

const browser =
  process.env.BROWSER ??
  [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].find(existsSync);
if (!browser) throw new Error("No Edge/Chrome found; set BROWSER");

const tmp = mkdtempSync(join(tmpdir(), "ls-icons-"));
const render = (name, svg, size) => {
  const html = join(tmp, `${name}.html`);
  writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:#0E0F12}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  execFileSync(browser, [
    "--headless=new", "--disable-gpu", `--user-data-dir=${join(tmp, "profile")}`, "--no-first-run", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${size},${size}`, `--screenshot=${join(pub, "icons", `${name}.png`)}`, pathToFileURL(html).href,
  ], { stdio: "ignore" });
  console.log("icons/" + name + ".png");
};

render("icon-192", icon(1), 192);
render("icon-512", icon(1), 512);
render("maskable-512", icon(0.78), 512);
render("apple-touch-icon", icon(0.86), 180);
