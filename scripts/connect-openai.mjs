// Turns on AI recall in the live app: asks for an OpenAI API key without showing it, checks it
// with a free request, then saves it to Vercel as a secret. The key is never printed or written to disk.
// Run from the repo folder after `npx vercel login`: node scripts/connect-openai.mjs
import { spawn, spawnSync } from "node:child_process";

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    spawnSync("stty", ["-echo"], { stdio: "inherit" });
    let value = "";
    process.stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\n" || ch === "\r") {
          process.stdin.off("data", onData);
          process.stdin.pause();
          spawnSync("stty", ["echo"], { stdio: "inherit" });
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          spawnSync("stty", ["echo"], { stdio: "inherit" });
          process.exit(130);
        }
        value += ch;
      }
    };
    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}

const key = (
  await askHidden(
    "Paste your new OpenAI API key (it stays hidden), then press Enter: ",
  )
).trim();
if (!key) {
  console.log("No key entered. Nothing was changed.");
  process.exit(1);
}
// listing models is free and proves the key works
const check = await fetch("https://api.openai.com/v1/models", {
  headers: { authorization: `Bearer ${key}` },
}).catch(() => null);
if (!check || check.status === 401) {
  console.log(
    "OpenAI says that key isn't valid. Copy it again and rerun this.",
  );
  process.exit(1);
}
if (!check.ok) {
  console.log(
    `OpenAI answered ${check.status}. Check the key's project and billing, then rerun.`,
  );
  process.exit(1);
}
console.log("The key works.");
const add = spawn(
  "npx",
  [
    "vercel",
    "env",
    "add",
    "OPENAI_API_KEY",
    "--environment",
    "production",
    "--sensitive",
    "--force",
  ],
  { stdio: ["pipe", "ignore", "pipe"] },
);
let err = "";
add.stderr.on("data", (d) => (err += d));
add.stdin.end(key);
add.on("close", (code) => {
  if (code === 0)
    console.log(
      "Saved to Vercel. Redeploy with `npx vercel deploy --prod` to turn on AI recall.",
    );
  else
    console.log(
      "Vercel didn't accept it:\n" +
        err
          .split("\n")
          .filter((l) => !l.includes(key))
          .slice(-5)
          .join("\n"),
    );
});
