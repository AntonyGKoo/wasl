// Builds src/app/theme-dark.css from src/app/globals.css: every color in the light theme gets a
// dark counterpart that keeps its hue. Backgrounds go dark, text goes light, borders go dim, and
// colored cards and buttons keep their color. Run it again after changing colors in globals.css:
//   node scripts/make-dark-theme.mjs
// Rules written by hand for the dark theme (":root[data-theme=dark] …" in globals.css) win over
// these and are left alone, and so are custom properties (the dark tokens are set by hand).
import { readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src/app/globals.css");
const target = path.join(root, "src/app/theme-dark.css");
const DARK = ':root[data-theme="dark"]';

// ---------- colors ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
function parseColor(text) {
  const t = text.trim().toLowerCase();
  if (t === "white") return [255, 255, 255, 1];
  if (t === "black") return [0, 0, 0, 1];
  let m = t.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = t.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}
const toHex = ([r, g, b, a]) =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.round(clamp(v, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("") +
  (a < 1
    ? Math.round(a * 255)
        .toString(16)
        .padStart(2, "0")
    : "");
function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// the dark surfaces everything is measured against
const CARD = parseColor("#1b2027");
// colored text often sits on a tinted panel, which is lighter than a card: read against that
const TINTED = parseColor("#2b333b");
const PAGE_LIGHT = ["#f6f8fa"]; // the light page background becomes the darkest layer

function darkText(c) {
  const [h, s, l] = rgbToHsl(c);
  if (l > 0.95) return c; // white text sits on colored buttons and cards: keep it
  if (s < 0.18) {
    // ink and grey text become light; lighter greys stay quieter
    const target =
      l < 0.3 ? 0.92 : l < 0.62 ? 0.76 : clamp(1.15 - l, 0.42, 0.7);
    return [...hslToRgb(h, Math.min(s, 0.12), target), c[3]];
  }
  // colored text: same hue, light enough to read on a dark card
  let L = Math.max(l, 0.45);
  let rgb = hslToRgb(h, Math.min(s, 0.6), L);
  while (contrast(rgb, TINTED) < 4.8 && L < 0.92) {
    L += 0.02;
    rgb = hslToRgb(h, Math.min(s, 0.6), L);
  }
  return [...rgb, c[3]];
}
function darkBackground(c, raw) {
  const [h, s, l] = rgbToHsl(c);
  if (c[3] < 1) {
    // frosted white bars (top bar, tab bar) become frosted dark ones; scrims and the
    // see-through highlights on colored cards already work on dark
    if (l >= 0.9 && c[3] >= 0.5) return [...CARD.slice(0, 3), c[3]];
    return c;
  }
  if (PAGE_LIGHT.includes(raw.toLowerCase())) return parseColor("#111418");
  if (l >= 0.88) {
    if (s < 0.2) {
      // white cards become dark cards; light grey panels become slightly lighter than cards
      if (l >= 0.995) return [...CARD.slice(0, 3), 1];
      return [
        ...hslToRgb(
          h || 210,
          Math.min(s, 0.14),
          clamp(0.13 + (1 - l) * 0.9, 0.14, 0.24),
        ),
        1,
      ];
    }
    // pale tints (teal, violet, coral, gold panels) become dark tints of the same hue
    return [
      ...hslToRgb(
        h,
        Math.min(s * 0.45, 0.38),
        clamp(0.17 + (1 - l) * 0.35, 0.17, 0.23),
      ),
      1,
    ];
  }
  if (l >= 0.75 && s < 0.25) return [...hslToRgb(h, s * 0.4, 0.3), 1]; // light grey fills
  return c; // colored buttons, cards and dark panels keep their color
}
function darkBorder(c) {
  const [h, s, l] = rgbToHsl(c);
  if (l < 0.7) return c;
  return [
    ...hslToRgb(
      h,
      Math.min(s * 0.4, 0.3),
      clamp(0.24 + (1 - l) * 0.35, 0.24, 0.34),
    ),
    c[3],
  ];
}
// colored glows (focus rings) keep their color; plain shadows become deeper black ones
function darkShadow(c) {
  const [h, s, l] = rgbToHsl(c);
  if (s >= 0.25)
    return [...hslToRgb(h, s, Math.max(l, 0.45)), Math.min(1, c[3] * 2.5)];
  return [0, 0, 0, Math.min(0.6, c[3] * 2.5)];
}

const kind = (prop) =>
  /^(color|fill|stroke|caret-color|accent-color|text-decoration-color|-webkit-text-fill-color)$/.test(
    prop,
  )
    ? "text"
    : /^(background|background-color|background-image)$/.test(prop)
      ? "background"
      : /^(border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color)$/.test(
            prop,
          )
        ? "border"
        : /shadow$/.test(prop)
          ? "shadow"
          : null;
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/g;
function darken(prop, value) {
  const k = kind(prop);
  if (!k) return value;
  return value.replace(COLOR, (raw) => {
    const c = parseColor(raw);
    if (!c) return raw;
    const out =
      k === "text"
        ? darkText(c)
        : k === "background"
          ? darkBackground(c, raw)
          : k === "border"
            ? darkBorder(c)
            : darkShadow(c);
    return toHex(out) === toHex(c) ? raw : toHex(out);
  });
}

// ---------- a small CSS reader (rules, @media blocks, comments) ----------
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  function block() {
    const nodes = [];
    while (i < css.length) {
      const open = css.indexOf("{", i);
      const close = css.indexOf("}", i);
      if (close !== -1 && (open === -1 || close < open)) {
        i = close + 1;
        return nodes;
      }
      if (open === -1) break;
      const prelude = css.slice(i, open).trim();
      i = open + 1;
      if (prelude.startsWith("@media") || prelude.startsWith("@supports")) {
        nodes.push({ at: prelude, children: block() });
      } else if (prelude.startsWith("@")) {
        // keyframes, font-face: skip the whole block
        let depth = 1;
        while (depth && i < css.length) {
          if (css[i] === "{") depth++;
          else if (css[i] === "}") depth--;
          i++;
        }
      } else {
        const end = css.indexOf("}", i);
        nodes.push({ selector: prelude, body: css.slice(i, end) });
        i = end + 1;
      }
    }
    return nodes;
  }
  return block();
}
const scope = (selector) =>
  selector
    .split(",")
    .map((s) => s.trim())
    .map((s) =>
      s === ":root" || s === "html"
        ? DARK
        : s.startsWith("html")
          ? s.replace(/^html/, `html[data-theme="dark"]`)
          : `${DARK} ${s}`,
    )
    .join(",\n");
function emit(nodes, indent = "") {
  let out = "";
  for (const n of nodes) {
    if (n.at) {
      const inner = emit(n.children, indent + "  ");
      if (inner) out += `${indent}${n.at} {\n${inner}${indent}}\n`;
      continue;
    }
    if (n.selector.includes('data-theme="dark"')) continue;
    const decls = [];
    for (const part of n.body.split(";")) {
      const at = part.indexOf(":");
      if (at < 0) continue;
      const prop = part.slice(0, at).trim();
      const value = part.slice(at + 1).trim();
      if (!prop || prop.startsWith("--")) continue;
      const next = darken(prop, value);
      if (next !== value) decls.push(`${indent}  ${prop}: ${next};`);
    }
    if (decls.length)
      out += `${indent}${scope(n.selector).replace(/\n/g, "\n" + indent)} {\n${decls.join("\n")}\n${indent}}\n`;
  }
  return out;
}

const css = await readFile(source, "utf8");
const out = `/* Dark theme, made by scripts/make-dark-theme.mjs from globals.css. Don't edit by hand:
   change globals.css (or its hand-written dark rules) and run the script again. */
${emit(parse(css))}`;
await writeFile(target, await prettier.format(out, { parser: "css" }));
console.log(
  `wrote ${path.relative(root, target)} (${out.split("\n").length} lines)`,
);
