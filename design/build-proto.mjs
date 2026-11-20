// Builds design/prototype.html: a clickable motion prototype of Let's Split.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { doodles } from "./assets/make-doodles.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const av = Object.fromEntries(Object.entries(doodles).map(([k, f]) =>
  [k, `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#FFF7EC"/>${f()}</svg>`]));
const tpl = readFileSync(join(here, "prototype.template.html"), "utf8");
writeFileSync(join(here, "prototype.html"), tpl.replace("/*__AVATARS__*/{}", JSON.stringify(av)));
console.log("prototype.html written");
