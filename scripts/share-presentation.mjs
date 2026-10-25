import { spawn } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const children = new Set();
let stopping = false;
function stop() {
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
function launch(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
function completion(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 || stopping
        ? resolve()
        : reject(new Error(`A presentation process stopped (${code}).`)),
    );
  });
}
const env = {
  ...process.env,
  DATABASE_URL: "",
  DATABASE_CA_CERT: "",
  OPENAI_API_KEY: "",
  GOOGLE_CLOUD_VISION_API_KEY: "",
  VERCEL: "",
  TRUST_PROXY: "false",
  WASL_PRESENTATION_MODE: "true",
  WASL_DATA_DIR: path.join(root, ".wasl-demo/shared-data"),
  WASL_PRESENTATION_DATA_DIR: path.join(root, ".wasl-demo/shared-data"),
  NEXT_TELEMETRY_DISABLED: "1",
};
try {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("Use Node 24 LTS for the shared presentation.");
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () =>
      reject(
        new Error("Port 3001 is in use. Stop the existing shared demo first."),
      ),
    );
    probe.listen(3001, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
  // Reuse the rehearsed production build without replacing files beneath the
  // independent local presentation server. New clones must build once first.
  await access(path.join(root, ".next/BUILD_ID")).catch(() => {
    throw new Error("First run npm run build, then npm run demo:share.");
  });
  const localBinary = path.join(root, ".wasl-demo/bin/cloudflared");
  const binary = await access(localBinary).then(
    () => localBinary,
    () => "cloudflared",
  );
  await completion(launch(binary, ["--version"])).catch(() => {
    throw new Error(
      "Install cloudflared from https://developers.cloudflare.com/tunnel/downloads/ first.",
    );
  });
  await completion(
    launch(
      process.execPath,
      ["--import", "tsx", "scripts/seed-presentation.ts"],
      { env },
    ),
  );
  const tunnel = launch(
    binary,
    [
      "tunnel",
      "--no-autoupdate",
      "--protocol",
      "http2",
      "--url",
      "http://127.0.0.1:3001",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const url = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            "The temporary sharing service did not return a URL. Try again while online.",
          ),
        ),
      60000,
    );
    const read = (chunk) => {
      output = (output + chunk.toString()).slice(-12000);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    };
    tunnel.stdout.on("data", read);
    tunnel.stderr.on("data", read);
    tunnel.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    tunnel.once("exit", () => {
      clearTimeout(timeout);
      reject(
        new Error(
          "The temporary sharing service stopped before returning a URL.",
        ),
      );
    });
  });
  if (stopping) throw new Error("Presentation stopped.");
  env.APP_URL = url;
  const app = launch(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3001",
    ],
    { env },
  );
  const appDone = completion(app);
  const tunnelDone = completion(tunnel);
  // Attach both immediately so an early exit is always handled.
  const done = Promise.race([appDone, tunnelDone]);
  done.catch(() => {});
  if (process.platform === "darwin") {
    const awake = launch("/usr/bin/caffeinate", ["-i"]);
    awake.on("error", () => {});
  }
  await writeFile(path.join(root, ".wasl-demo/share-url.txt"), url + "\n");
  console.log(
    `\nTEAM DEMO: ${url}\nChoose Open presentation demo. Shared fictional workspace only.\nKeep this process running and the laptop open, plugged in and online.\nThis temporary URL changes on restart. Local presentation remains at http://localhost:3000.\n`,
  );
  await done;
} catch (error) {
  if (!stopping) {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  stop();
}
