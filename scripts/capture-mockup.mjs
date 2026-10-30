// Captures phone-size screenshots of every step of the clickable mockup (public/mockup/index.html)
// into docs/presentation/mockup-screens, for slides and the user-testing handout.
// The phone camera is fed docs/presentation/sample-business-card.jpg (needs ffmpeg), so the
// paper-card screenshots show a real scan.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
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
const base = `http://localhost:${server.address().port}/`;

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
      await click(p, '[data-act="scan-sample"]');
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
    "05b-scan-paper-card",
    "#step-3",
    async (p) => {
      await click(p, '[data-act="share"]');
      await sleep(300);
      await click(p, '[data-act="scan-paper"]');
      await p.waitForFunction(
        () => document.getElementById("camVideo")?.videoWidth > 0,
      );
      await sleep(1200);
    },
  ],
  [
    "05c-scan-review",
    "#step-3",
    async (p) => {
      await click(p, '[data-act="share"]');
      await sleep(300);
      await click(p, '[data-act="scan-paper"]');
      await p.waitForFunction(
        () => document.getElementById("camVideo")?.videoWidth > 0,
      );
      await sleep(800);
      await click(p, '[data-act="scan-capture"]');
      await p.waitForSelector("#scan-name", { timeout: 90000 });
      await sleep(600);
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
  [
    "11-recall-who-is-going",
    "#step-7",
    async (p) => {
      await click(p, '[data-act="suggest"]:last-child');
      await sleep(3600);
    },
  ],
];

await mkdir(outDir, { recursive: true });
const tmp = path.join(os.tmpdir(), `wasl-capture-${process.pid}`);
await mkdir(tmp, { recursive: true });
const camera = path.join(tmp, "camera.y4m");
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-loop",
  "1",
  "-i",
  path.join(root, "docs/presentation/sample-business-card.jpg"),
  "-t",
  "2",
  "-r",
  "10",
  "-vf",
  "scale=1280:720",
  "-pix_fmt",
  "yuv420p",
  camera,
]);
const args = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--use-file-for-fake-video-capture=${camera}`,
];
// Prefer Playwright's own Chromium; fall back to the installed Chrome when its download is missing.
const browser = await chromium
  .launch({ args })
  .catch(() => chromium.launch({ channel: "chrome", args }));
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  permissions: ["camera"],
});
for (const [name, hash, act] of shots) {
  const p = await context.newPage();
  await p.goto(base + hash);
  // hide the guide pill and its band: the screenshots show only the app
  await p.addStyleTag({
    content:
      ".mobile-bar { display: none !important; } .screen { top: 0 !important; padding-top: 20px !important; }",
  });
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
await rm(tmp, { recursive: true, force: true });
