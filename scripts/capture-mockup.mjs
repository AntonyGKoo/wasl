// Captures phone-size screenshots of every step of the clickable mockup (public/mockup/index.html)
// into docs/presentation/mockup-screens, for slides and the user-testing handout.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs/presentation/mockup-screens");
const page = path.join(root, "public/mockup/index.html");

const server = createServer(async (_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await readFile(page));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (p, selector) => p.locator(selector).first().click();

// Each shot opens a step by its #step- link, then taps through to the moment worth showing.
const shots = [
  ["01-join", "#step-1", async () => {}],
  [
    "02-profile-level-up",
    "#step-1",
    async (p) => {
      await click(p, '[data-act="scan-own"]');
      await sleep(2300);
      await click(p, '[data-act="create-profile"]');
      await sleep(2600);
    },
  ],
  [
    "03-build-card",
    "#step-2",
    async (p) => {
      await click(p, '[data-act="add-field"][data-f="linkedin"]');
    },
  ],
  ["04-wallet", "#step-3", async () => {}],
  [
    "05-card-swap",
    "#step-3",
    async (p) => {
      await click(p, '[data-act="share"]');
      await sleep(300);
      await click(p, '[data-act="do-swap"]');
      await sleep(3400);
    },
  ],
  [
    "06-save-context-and-tag",
    "#step-4",
    async (p) => {
      await click(p, '[data-act="confirm-ctx"]');
      await click(p, '[data-act="tag"][data-t="Hiring"]');
      await sleep(2400);
    },
  ],
  [
    "07-remember-summary",
    "#step-5",
    async (p) => {
      await click(p, '[data-act="type-note"]');
      await click(p, '[data-act="save-note"]');
      await sleep(2400);
    },
  ],
  ["08-swipe-debrief", "#step-bonus", async () => {}],
  ["09-browse-albums", "#step-6", async () => {}],
  [
    "10-recall-by-memory",
    "#step-7",
    async (p) => {
      await click(p, '[data-act="suggest"]');
      await sleep(3200);
    },
  ],
];

await mkdir(outDir, { recursive: true });
// Prefer Playwright's own Chromium; fall back to the installed Chrome when its download is missing.
const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ channel: "chrome" }));
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
for (const [name, hash, act] of shots) {
  const p = await context.newPage();
  await p.goto(base + hash);
  await p.addStyleTag({ content: ".mobile-bar { display: none !important; }" });
  await p.evaluate(() => document.fonts.ready);
  await sleep(500);
  await act(p);
  await sleep(400);
  await p.screenshot({ path: path.join(outDir, `${name}.png`) });
  await p.close();
  console.log(`saved ${name}.png`);
}
await browser.close();
server.close();
