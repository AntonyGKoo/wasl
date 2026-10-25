import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("Use Node 24 LTS to start the Wasl presentation.");
  process.exit(1);
}
const port = 3000;
const probe = net.createServer();
try {
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
} catch {
  console.error(
    "Port 3000 is already in use. If Wasl is open, use http://localhost:3000. To reset the demo, stop its terminal with Ctrl+C, then run npm run demo again.",
  );
  process.exit(1);
}
const env = {
  ...process.env,
  DATABASE_URL: "",
  DATABASE_CA_CERT: "",
  OPENAI_API_KEY: "",
  GOOGLE_CLOUD_VISION_API_KEY: "",
  VERCEL: "",
  TRUST_PROXY: "false",
  APP_URL: `http://localhost:${port}`,
  WASL_DATA_DIR: path.join(root, ".wasl-demo/data"),
  WASL_PRESENTATION_MODE: "true",
  NEXT_TELEMETRY_DISABLED: "1",
};
let active;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => active?.kill(signal));
async function run(args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  active = child;
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Process stopped (${code}).`)),
    );
  });
}
try {
  await run(["--import", "tsx", "scripts/seed-presentation.ts"]);
  // Build locally each launch so tomorrow's demo uses the current source.
  await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
  console.log(
    "\nWasl presentation: http://localhost:3000\nChoose Open presentation demo. No cloud credentials or Wi-Fi are needed.\nRestarting npm run demo resets only the separate fictional workspace.\n",
  );
  await run([
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
