// Records a captioned 9:16 walkthrough video of the clickable mockup (public/mockup/index.html).
// The phone's camera is fed tests/fixtures/sample-business-card.jpg, so the paper-card scan
// in the video is a real OCR read.
// Usage: node scripts/record-walkthrough.mjs [output.mp4]   (needs Google Chrome and ffmpeg)
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
const tmp = path.join(os.tmpdir(), `wasl-walkthrough-${process.pid}`);
await mkdir(tmp, { recursive: true });

// fake camera: the sample card photo as a short looping video
const camera = path.join(tmp, "camera.y4m");
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-loop",
  "1",
  "-i",
  path.join(root, "tests/fixtures/sample-business-card.jpg"),
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

const server = createServer(async (_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await readFile(path.join(root, "public/mockup/index.html")));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
// "localhost" counts as a secure origin, so the page may use the camera
const base = `http://localhost:${server.address().port}/`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The video is 1008x1792 (9:16). The page is drawn at 2x, so layout works in a 504x896 space:
// the phone (scaled to 0.75) sits at the top and the caption panel underneath.
const VW = 1008;
const VH = 1792;
const stageCss = `
  html { zoom: 2; }
  body { background: radial-gradient(120% 70% at 50% 0%, #1d232b, #0d1014 70%); }
  .guide, .mobile-bar { display: none !important; }
  .stage { display: block !important; height: auto !important; padding: 0 !important; }
  .device { position: absolute !important; left: 50%; top: 22px; margin-left: -154px; zoom: .75; height: 844px !important; max-height: none !important; }
  #wt-caption { position: fixed; left: 24px; right: 24px; top: 688px; height: 186px; box-sizing: border-box; padding: 18px 20px;
    border-radius: 22px; background: rgba(22, 25, 30, .92); border: 1px solid #343b45; color: #f1f3f5;
    font-family: "DM Sans", system-ui, sans-serif; z-index: 100; transition: opacity .25s; }
  #wt-caption.out { opacity: 0; }
  #wt-caption .wt-step { font-family: "DM Mono", ui-monospace, monospace; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #8a949f; display: flex; gap: 8px; align-items: center; }
  #wt-caption .wt-step b { padding: 2px 7px; border-radius: 6px; font-weight: 500; }
  #wt-caption .wt-title { font-family: "Manrope", system-ui, sans-serif; font-weight: 800; font-size: 25px; line-height: 1.15; margin-top: 8px; letter-spacing: -.3px; }
  #wt-caption .wt-text { font-size: 16px; line-height: 1.4; color: #a7b0ba; margin-top: 6px; }
  #wt-taps { position: fixed; inset: 0; zoom: .5; pointer-events: none; z-index: 200; }
  #wt-taps i { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%;
    border: 4px solid rgba(255,255,255,.95); background: rgba(255,255,255,.28); animation: wt-tap 520ms ease-out forwards; }
  @keyframes wt-tap { from { transform: scale(.45); opacity: 1; } to { transform: scale(1.35); opacity: 0; } }
`;
const WOW = {
  1: ["#5cc4b8", "rgba(92,196,184,.16)"],
  2: ["#efa066", "rgba(239,160,102,.16)"],
  3: ["#a08ee6", "rgba(160,142,230,.18)"],
};

const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${camera}`,
  ],
});
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  hasTouch: true,
  permissions: ["camera"],
});
const p = await context.newPage();
await p.goto(base + "#step-1");
await p.addStyleTag({ content: stageCss });
await p.evaluate(() => {
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div id="wt-caption" class="out"></div><div id="wt-taps"></div>',
  );
  return document.fonts.ready;
});
await sleep(600);

// Smooth capture: Chromium's screencast sends a frame whenever the screen changes.
const frames = [];
const cdp = await context.newCDPSession(p);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  frames.push({ data, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 92,
  maxWidth: VW,
  maxHeight: VH,
  everyNthFrame: 1,
});
// a heartbeat keeps frames coming while nothing moves, so timing stays exact
const beat = setInterval(
  () =>
    p
      .evaluate(() => {
        document.body.style.outlineColor = document.body.style.outlineColor
          ? ""
          : "transparent";
      })
      .catch(() => {}),
  200,
);

async function caption(step, wow, title, text, hold = 0) {
  await p.evaluate(
    ({ step, wow, title, text, colors }) => {
      const el = document.getElementById("wt-caption");
      el.classList.add("out");
      setTimeout(() => {
        const badge = wow
          ? `<b style="color:${colors[wow][0]};background:${colors[wow][1]}">WOW ${wow}</b>`
          : "";
        el.innerHTML = `<div class="wt-step">${step}${badge}</div><div class="wt-title">${title}</div><div class="wt-text">${text}</div>`;
        el.classList.remove("out");
      }, 250);
    },
    { step, wow, title, text, colors: WOW },
  );
  await sleep(350 + hold);
}
// Shows a tap ring where the finger lands, then taps. `at` is a point inside the element
// (for cards partly covered by others in the wallet stack).
async function tap(selector, pause = 800, at) {
  const target = p.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const pos = at || { x: box.width / 2, y: box.height / 2 };
  await p.evaluate(
    ({ x, y }) => {
      const i = document.createElement("i");
      i.style.left = x + "px";
      i.style.top = y + "px";
      document.getElementById("wt-taps").appendChild(i);
      setTimeout(() => i.remove(), 600);
    },
    { x: box.x + pos.x, y: box.y + pos.y },
  );
  await sleep(280);
  await target.click({ position: pos });
  await sleep(pause);
}
async function swipe(direction) {
  const box = await p.locator("#deck .card.top").boundingBox();
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width / 2;
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 16; i++) {
    await p.mouse.move(x0 + direction * i * 16, y + i);
    await sleep(22);
  }
  await p.mouse.up();
  await sleep(1000);
}
async function scrollScreen(px) {
  await p.evaluate(
    (px) =>
      document
        .getElementById("screen")
        .scrollBy({ top: px, behavior: "smooth" }),
    px,
  );
  await sleep(1000);
}
async function type(selector, text) {
  await p.locator(selector).fill("");
  await p.locator(selector).pressSequentially(text, { delay: 45 });
}

// ---- the walkthrough ----
await caption(
  "Wasl · prototype walkthrough",
  0,
  "Never forget who you met, or why it mattered.",
  "A networking wallet that remembers people for you. Here is the whole flow in about two minutes.",
  3600,
);

await caption(
  "Step 1 · Join",
  1,
  "Start from what you already have",
  "Scan your own business card and Wasl fills in your profile. No long form.",
  2600,
);
// For your own card, the camera shows sample-own-card.jpg (drawn into a canvas stream);
// the paper-card scan later uses Chrome's fake camera with the other sample card.
const ownCard = (
  await readFile(path.join(root, "tests/fixtures/sample-own-card.jpg"))
).toString("base64");
await p.evaluate(async (b64) => {
  const img = new Image();
  img.src = "data:image/jpeg;base64," + b64;
  await img.decode();
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  window.__restoreCamera = () => (navigator.mediaDevices.getUserMedia = real);
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    const ctx = c.getContext("2d");
    const draw = () => {
      ctx.drawImage(img, 0, 0, 1280, 720);
      requestAnimationFrame(draw);
    };
    draw();
    return c.captureStream(15);
  };
}, ownCard);
await tap('[data-act="scan-own"]', 600);
await p.waitForFunction(
  () => {
    const v = document.getElementById("camVideo");
    return v && v.videoWidth > 0;
  },
  null,
  { timeout: 15000 },
);
await sleep(2000);
await tap('[data-act="scan-capture"]', 400);
await p.waitForSelector("#scan-name", { timeout: 90000 });
await p.evaluate(() => window.__restoreCamera());
await caption(
  "Step 1 · Join",
  1,
  "It reads your card for real",
  "The text reader pulls out your name, role, university, email, phone and LinkedIn. Check them, then create your profile.",
  2800,
);
await tap('[data-act="scan-apply"]', 900);
await caption(
  "Step 1 · Join",
  1,
  "Your profile levels up as it fills in",
  "Every detail earns XP. Two more details take Antony from Level 3 to Level 4.",
  1400,
);
await scrollScreen(420);
await tap('[data-act="edit-detail"][data-f="instagram"]', 500);
await p.locator("#detailInput").pressSequentially("antonygu", { delay: 60 });
await p.locator("#detailInput").press("Enter");
await sleep(1100);
await tap('label[for="photoFile"]', 200);
await p.setInputFiles(
  "#photoFile",
  path.join(root, "tests/fixtures/sample-avatar.jpg"),
);
await sleep(2400);

await caption(
  "Step 2 · Build",
  1,
  "Add a card for each crowd",
  "You start with one card. Add an Event card, then switch each detail on or off and pick a color.",
  600,
);
await tap('#tabbar [data-go="wallet"]', 1000);
await tap("#screen .add-card", 1100);
await tap('[data-act="pick-card"][data-k="event"]', 1300);
await tap('[data-act="add-field"][data-f="linkedin"]', 1000);
await tap('[data-act="hide-field"][data-f="org"]', 1000);
await tap('[data-act="color"][data-c="team"]', 1000);
await tap('[data-act="save-card"]', 1600); // adds the Event card

await caption(
  "Step 3 · Share",
  1,
  "Your cards stack like a wallet",
  "Your Professional and Event cards each show different details. Tap one to bring it forward, then share it.",
  600,
);
await tap('.wallet [data-id="pro"]', 2400, { x: 160, y: 24 });
await tap('[data-act="share"]', 1200);

await caption(
  "Step 3 · Share",
  1,
  "No Wasl? Scan their paper card",
  "This is a real scan: the camera photographs the card and the text reader pulls out each detail.",
  600,
);
await tap('[data-act="scan-paper"]', 1200);
await p.waitForFunction(
  () => {
    const v = document.getElementById("camVideo");
    return v && v.videoWidth > 0;
  },
  null,
  { timeout: 15000 },
);
await sleep(2200);
await tap('[data-act="scan-capture"]', 400);
await p.waitForSelector("#scan-name", { timeout: 90000 });
await sleep(1200);
await caption(
  "Step 3 · Share",
  1,
  "Check what it read, then save",
  "Name, role, company, email, phone and website, read from the photo. Fix anything before saving.",
  2600,
);
await tap('[data-act="scan-apply"]', 2600);

await caption(
  "Step 3 · Share",
  1,
  "Or swap cards in one scan",
  "If they have Wasl, scan their code. Mariam gets your Professional card and you get hers.",
  600,
);
await tap('[data-go="exchange-reset"]', 900);
await tap('[data-act="has-wasl"]', 1300);
await tap('[data-act="do-swap"]', 2600);
await tap('[data-go="save"]', 1000);

await caption(
  "Step 4 · Save",
  2,
  "Wasl already knows where you met",
  "Your calendar and location fill in the event, place and time. Confirm it, then tag why it matters.",
  2400,
);
await tap('[data-act="confirm-ctx"]', 1100);
await scrollScreen(300);
await tap('[data-act="tag"][data-t="Hiring"]', 800);
await tap('[data-act="tag"][data-t="Intro offered"]', 1500);
await tap('#screen [data-go="remember"]', 1000);

await caption(
  "Step 5 · Remember",
  2,
  "Talk. Wasl keeps the notes.",
  "Both people agree, then tap the mic. Wasl writes down what's said and keeps only the key points. No audio is kept.",
  1600,
);
// The browser's speech-to-text needs a real microphone, so for the video a stand-in
// "hears" Mariam's side of the chat; the transcript and key points are produced by the app.
await p.evaluate(() => {
  const lines = [
    "hi I'm Mariam nice to meet you",
    "I'm a software engineer at Pearl Labs working on our payments app",
    "the weather is lovely tonight",
    "if you want I can introduce you to our CTO",
    "we're also hiring interns for next summer so apply before December",
  ];
  class Heard {
    start() {
      this.on = true;
      const results = [];
      const next = () => {
        if (!this.on || !lines.length) return;
        const r = [{ transcript: lines.shift() }];
        r.isFinal = true;
        results.push(r);
        this.onresult &&
          this.onresult({ resultIndex: results.length - 1, results });
        setTimeout(next, 1300);
      };
      setTimeout(next, 700);
    }
    stop() {
      this.on = false;
      setTimeout(() => this.onend && this.onend(), 50);
    }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = Heard;
});
await tap("#mic", 1300);
await tap('[data-act="agree"]', 1000);
await tap("#mic", 7600);
await tap("#mic", 2600);

await caption(
  "Bonus · Debrief",
  2,
  "Swipe through tonight's people",
  "Right to favorite, left to keep as a contact. Thirty seconds and your whole night is saved.",
  600,
);
await tap('#screen [data-go="debrief"]', 1400);
await swipe(1);
await swipe(-1);
await swipe(1);

await caption(
  "Step 6 · Browse",
  3,
  "Albums by event and company",
  "Everyone you meet is sorted by event, company and tag. The card you just scanned is already here.",
  600,
);
await tap('#tabbar [data-go="network"]', 2200);
await tap('[data-act="sort"][data-s="company"]', 2000);
await tap('[data-act="album"]', 1500);
await p.evaluate(() =>
  document.querySelector(".flip")?.scrollBy({ left: 640, behavior: "smooth" }),
);
await sleep(2000);

await caption(
  "Step 7 · Search",
  3,
  "Find people by memory, not by name",
  "Weeks later, describe someone the way you remember them. Wasl finds them and shows why.",
  600,
);
await tap('#tabbar [data-go="recall"]', 1300);
await tap('[data-act="suggest"]', 3800);
await scrollScreen(260);
await sleep(2400);

await caption(
  "Step 7 · Search",
  3,
  "Who from your network is going?",
  "Before an event, ask who you've already met that will be there, and who is worth meeting again.",
  600,
);
await scrollScreen(-800);
await tap("#recallInput", 300);
await type("#recallInput", "who I've met is going to Web Summit Qatar?");
await p.locator("#recallInput").press("Enter");
await sleep(3400);
await scrollScreen(260);
await sleep(2600);

await caption(
  "Wasl",
  0,
  "Digital cards help them remember you.",
  "Wasl helps you remember them. Mockup: antonygkoo.github.io/wasl-prototype · Real app: wasl-sable.vercel.app",
  0,
);
await tap('#tabbar [data-go="wallet"]', 4200);

clearInterval(beat);
await cdp.send("Page.stopScreencast");
await browser.close();
server.close();

// Each frame stays on screen until the next one arrived; then resample to a steady 30 fps.
const list = [];
for (let i = 0; i < frames.length; i++) {
  const file = path.join(tmp, `f${String(i).padStart(5, "0")}.jpg`);
  await writeFile(file, Buffer.from(frames[i].data, "base64"));
  const next = frames[i + 1] ? frames[i + 1].t : frames[i].t + 1;
  list.push(
    `file '${file}'`,
    `duration ${Math.max(next - frames[i].t, 0.001).toFixed(4)}`,
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
  `fps=30,scale=${VW}:${VH}:flags=lanczos,format=yuv420p`,
  "-c:v",
  "libx264",
  "-crf",
  "18",
  "-preset",
  "slow",
  "-profile:v",
  "high",
  "-movflags",
  "+faststart",
  output,
]);
await rm(tmp, { recursive: true, force: true });
console.log(`saved ${output} (${frames.length} frames)`);
