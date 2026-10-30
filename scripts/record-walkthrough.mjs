// Records a captioned phone-size walkthrough of the clickable mockup (public/mockup/index.html).
// Usage: node scripts/record-walkthrough.mjs [output.mp4]   (needs ffmpeg on PATH)
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(
  process.argv[2] ||
    path.join(os.homedir(), "Downloads/Wasl-Mockup-Walkthrough.mp4"),
);
const page = path.join(root, "public/mockup/index.html");
const tmp = path.join(os.tmpdir(), `wasl-walkthrough-${process.pid}`);

const server = createServer(async (_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await readFile(page));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The phone screen is 844px tall; the caption panel sits underneath it.
const W = 390;
const PHONE_H = 844;
const CAPTION_H = 170;
const frameCss = `
  .mobile-bar { display: none !important; }
  .stage { height: ${PHONE_H}px !important; }
  .device { height: ${PHONE_H}px !important; }
  #wt-caption { position: fixed; left: 0; right: 0; top: ${PHONE_H}px; height: ${CAPTION_H}px; box-sizing: border-box;
    padding: 18px 22px; background: #0d1014; border-top: 1px solid #343b45; color: #f1f3f5;
    font-family: "DM Sans", system-ui, sans-serif; z-index: 100; }
  #wt-caption .wt-step { font-family: "DM Mono", ui-monospace, monospace; font-size: 12px; letter-spacing: .08em;
    text-transform: uppercase; color: #5cc4b8; }
  #wt-caption .wt-step b { margin-left: 8px; padding: 2px 6px; border-radius: 5px; font-weight: 500; }
  #wt-caption .wt-title { font-family: "Manrope", system-ui, sans-serif; font-weight: 800; font-size: 21px; margin-top: 6px; }
  #wt-caption .wt-text { font-size: 15px; line-height: 1.4; color: #a7b0ba; margin-top: 4px; }
  #wt-tap { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
    border: 3px solid rgba(255,255,255,.9); background: rgba(255,255,255,.25); z-index: 200; pointer-events: none;
    animation: wt-tap 450ms ease-out forwards; }
  @keyframes wt-tap { from { transform: scale(.5); opacity: 1; } to { transform: scale(1.3); opacity: 0; } }
`;
const WOW_COLORS = {
  1: ["#5cc4b8", "rgba(92,196,184,.16)"],
  2: ["#efa066", "rgba(239,160,102,.16)"],
  3: ["#a08ee6", "rgba(160,142,230,.18)"],
};

await mkdir(tmp, { recursive: true });
const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ channel: "chrome" }));
const context = await browser.newContext({
  viewport: { width: W, height: PHONE_H + CAPTION_H },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const p = await context.newPage();
await p.goto(base + "#step-1");
await p.addStyleTag({ content: frameCss });
await p.evaluate(() => document.fonts.ready);

// Record by taking full-resolution (2x) screenshots back to back, each stamped with its time,
// then let the system ffmpeg turn the timed frames into an MP4.
const frames = [];
let recording = true;
const recorder = (async () => {
  while (recording) {
    const t = Date.now() / 1000;
    const shot = await p
      .screenshot({
        type: "jpeg",
        quality: 88,
        animations: "allow",
        caret: "initial",
      })
      .catch(() => null);
    if (shot) frames.push({ data: shot.toString("base64"), t });
  }
})();

async function caption(step, wow, title, text) {
  await p.evaluate(
    ({ step, wow, title, text, colors }) => {
      let el = document.getElementById("wt-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "wt-caption";
        document.body.appendChild(el);
      }
      const badge = wow
        ? `<b style="color:${colors[wow][0]};background:${colors[wow][1]}">WOW ${wow}</b>`
        : "";
      el.innerHTML = `<div class="wt-step">${step}${badge}</div><div class="wt-title">${title}</div><div class="wt-text">${text}</div>`;
    },
    { step, wow, title, text, colors: WOW_COLORS },
  );
}
// `at` is a point inside the element to tap, for elements partly covered by others (the wallet stack).
async function tap(selector, pause = 700, at) {
  const target = p.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const position = at || (box && { x: box.width / 2, y: box.height / 2 });
  if (box) {
    await p.evaluate(
      ({ x, y }) => {
        const d = document.createElement("div");
        d.id = "wt-tap";
        d.style.left = x + "px";
        d.style.top = y + "px";
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 500);
      },
      { x: box.x + position.x, y: box.y + position.y },
    );
    await sleep(250);
  }
  await target.click({ position });
  await sleep(pause);
}
async function swipe(direction) {
  const box = await p.locator("#deck .card.top").boundingBox();
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width / 2;
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(x0 + direction * i * 14, y + i);
    await sleep(25);
  }
  await p.mouse.up();
  await sleep(900);
}
async function scrollScreen(px) {
  await p.evaluate(
    (px) =>
      document
        .getElementById("screen")
        .scrollBy({ top: px, behavior: "smooth" }),
    px,
  );
  await sleep(900);
}

// ---- the walkthrough ----
await caption(
  "Wasl",
  0,
  "Never forget who you met, or why it mattered.",
  "A networking wallet that remembers people for you. Here is the whole flow, step by step.",
);
await sleep(4000);

await caption(
  "Step 1 · Join",
  1,
  "Start from what you already have",
  "Scan your own business card. Wasl reads it and fills in your profile. No long form.",
);
await sleep(1800);
await tap('[data-act="scan-own"]', 2600);
await sleep(1200);
await tap('[data-act="create-profile"]', 1200);
await caption(
  "Step 1 · Join",
  1,
  "Your profile levels up as it fills in",
  "Each detail you add earns XP. Two more details take Antony from Level 3 to Level 4.",
);
await sleep(1600);
await scrollScreen(420);
await tap('[data-act="add-detail"][data-f="instagram"]', 900);
await tap('[data-act="add-detail"][data-f="photo"]', 2200);

await caption(
  "Step 2 · Build",
  1,
  "The card is the editor",
  "Each card shows only what you choose. Tap a detail to hide it, add one from your profile, pick a color.",
);
await tap('#tabbar [data-go="wallet"]', 900);
await tap('#screen [data-act="edit-front"]', 1000);
await tap('[data-act="add-field"][data-f="linkedin"]', 900);
await tap('[data-act="hide-field"][data-f="org"]', 900);
await tap('[data-act="color"][data-c="team"]', 900);
await tap('[data-act="save-card"]', 1500);

await caption(
  "Step 3 · Share",
  1,
  "Your cards stack like a wallet",
  "Professional, Event, Social, Team: each one shows different details. Tap one to bring it forward.",
);
await tap('.wallet [data-id="pro"]', 1800, { x: 160, y: 24 });
await tap('[data-act="share"]', 1200);
await caption(
  "Step 3 · Share",
  1,
  "No Wasl? Scan their paper card",
  "If someone only has a paper business card, Wasl reads it and saves them anyway.",
);
await tap('[data-act="scan-paper"]', 2600);
await sleep(1600);
await tap('[data-go="exchange-reset"]', 900);
await caption(
  "Step 3 · Share",
  1,
  "One scan, and the cards swap",
  "Mariam gets your Professional card, and you get hers.",
);
await tap('[data-act="do-swap"]', 2400);
await tap('[data-go="save"]', 900);

await caption(
  "Step 4 · Save",
  2,
  "Wasl already knows where you met",
  "Your calendar and location fill in the event, place and time. Confirm it, then tag why it matters.",
);
await sleep(2000);
await tap('[data-act="confirm-ctx"]', 1000);
await scrollScreen(300);
await tap('[data-act="tag"][data-t="Hiring"]', 700);
await tap('[data-act="tag"][data-t="Intro offered"]', 1400);
await tap('#screen [data-go="remember"]', 900);

await caption(
  "Step 5 · Remember",
  2,
  "Talk. Wasl keeps the notes.",
  "Both people agree first. Then AI keeps a short summary of what mattered, and the audio is deleted.",
);
await sleep(1200);
await tap("#mic", 1200);
await tap('[data-act="agree"]', 900);
await tap("#mic", 5200);
await sleep(1500);

await caption(
  "Bonus · Debrief",
  2,
  "Swipe through tonight's people",
  "Swipe right to favorite, left to keep as a contact. Thirty seconds, and your night is saved.",
);
await tap('#screen [data-go="debrief"]', 1200);
await swipe(1);
await swipe(-1);
await swipe(1);

await caption(
  "Step 6 · Browse",
  3,
  "Albums build themselves",
  "Everyone you meet is sorted by event, company and tag. You never sort anything.",
);
await tap('#tabbar [data-go="network"]', 1500);
await tap('[data-act="sort"][data-s="company"]', 1800);
await tap('[data-act="album"]', 1500);
await p.evaluate(() =>
  document.querySelector(".flip")?.scrollBy({ left: 620, behavior: "smooth" }),
);
await sleep(1800);

await caption(
  "Step 7 · Recall",
  3,
  "Find people by memory, not by name",
  "Weeks later, describe the person the way you remember them. Wasl finds them and shows why.",
);
await tap('#tabbar [data-go="recall"]', 1200);
await tap('[data-act="suggest"]', 3600);
await scrollScreen(260);
await sleep(2200);

await caption(
  "Step 7 · Recall",
  3,
  "Who from your network is going?",
  "Before an event, ask who you've already met that will be there. Wasl points out who is worth meeting again.",
);
await scrollScreen(-600);
await p.locator("#recallInput").fill("");
await tap("#recallInput", 300);
await p
  .locator("#recallInput")
  .pressSequentially("who I've met is going to Web Summit Qatar?", {
    delay: 35,
  });
await p.locator("#recallInput").press("Enter");
await sleep(3000);
await scrollScreen(260);
await sleep(2200);

await caption(
  "Wasl",
  0,
  "Digital cards help them remember you.",
  "Wasl helps you remember them. Try it yourself: antonygkoo.github.io/wasl-prototype",
);
await tap('#tabbar [data-go="wallet"]', 3500);

recording = false;
await recorder;
await browser.close();
server.close();

// Each frame stays on screen until the next one arrived; the last one holds for a second.
const list = [];
for (let i = 0; i < frames.length; i++) {
  const file = path.join(tmp, `f${String(i).padStart(5, "0")}.jpg`);
  await writeFile(file, Buffer.from(frames[i].data, "base64"));
  const next = frames[i + 1] ? frames[i + 1].t : frames[i].t + 1;
  list.push(
    `file '${file}'`,
    `duration ${Math.max(next - frames[i].t, 0.001).toFixed(3)}`,
  );
}
list.push(
  `file '${path.join(tmp, `f${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`,
);
await writeFile(path.join(tmp, "frames.txt"), list.join("\n"));
await mkdir(path.dirname(output), { recursive: true });
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  path.join(tmp, "frames.txt"),
  "-vf",
  "scale=trunc(iw/2)*2:trunc(ih/2)*2",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-crf",
  "20",
  "-preset",
  "medium",
  "-movflags",
  "+faststart",
  "-r",
  "30",
  output,
]);
await rm(tmp, { recursive: true, force: true });
console.log(`saved ${output}`);
