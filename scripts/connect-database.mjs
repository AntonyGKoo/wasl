// Connects the live Wasl app on Vercel to its Supabase database, e.g. after resetting the
// database password. Asks for the password without showing it, checks it works, then saves the
// connection to Vercel as a secret. The password is never printed or written to disk.
// Run from the repo folder after `npx vercel login`: node scripts/connect-database.mjs [project-ref]
import { createRequire } from "node:module";
import { spawnSync, spawn } from "node:child_process";
import path from "node:path";

const repo = process.cwd();
const require = createRequire(path.join(repo, "package.json"));
const postgres = require("postgres");
require("@next/env").loadEnvConfig(repo);

// the "Wasl MVP" project in Mumbai (ap-south-1), unless another project ref is given
const REF = process.argv[2] || "zudfbyrvcfbfusmbzlmm";
const HOSTS = [
  "aws-0-ap-south-1.pooler.supabase.com",
  "aws-1-ap-south-1.pooler.supabase.com",
];
const ca = (process.env.DATABASE_CA_CERT || "").replace(/\\n/g, "\n");

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

const password = (
  await askHidden(
    "Paste the Supabase database password (it stays hidden), then press Enter: ",
  )
).trim();
if (!password) {
  console.log("No password entered. Nothing was changed.");
  process.exit(1);
}

let url = null;
for (const host of HOSTS) {
  const candidate = `postgresql://postgres.${REF}:${encodeURIComponent(password)}@${host}:6543/postgres?sslmode=verify-full`;
  const sql = postgres(candidate, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => {},
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  });
  try {
    const [row] =
      await sql`select count(*)::int as tables from pg_tables where schemaname = 'public'`;
    console.log(`Connected to the Wasl database (${row.tables} tables).`);
    url = candidate;
  } catch (error) {
    const msg = String(error.message || error);
    if (/password authentication failed/i.test(msg)) {
      console.log(
        "Supabase says that password is wrong. Copy it again (or reset it again) and rerun this.",
      );
      process.exit(1);
    }
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
  if (url) break;
}
if (!url) {
  console.log(
    "Couldn't reach the database. Make sure the Wasl MVP project is running in Supabase, then rerun this.",
  );
  process.exit(1);
}

// save the working connection as a Vercel secret, replacing any earlier value
const add = spawn(
  "npx",
  [
    "vercel",
    "env",
    "add",
    "DATABASE_URL",
    "--environment",
    "production",
    "--sensitive",
    "--force",
  ],
  { cwd: repo, stdio: ["pipe", "ignore", "pipe"] },
);
let err = "";
add.stderr.on("data", (d) => (err += d));
add.stdin.end(url);
add.on("close", (code) => {
  if (code === 0)
    console.log(
      "Saved to Vercel. You can close this tab; redeploy with `npx vercel deploy --prod` to use it.",
    );
  else
    console.log(
      "Vercel didn't accept it:\n" +
        err
          .split("\n")
          .filter((l) => !l.includes(password))
          .slice(-5)
          .join("\n"),
    );
});
