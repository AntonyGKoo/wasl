import { spawn } from "node:child_process";
import path from "node:path";
// Polling also works on shared workspaces with limited native file watchers.
const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", "--webpack", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, WATCHPACK_POLLING: process.env.WATCHPACK_POLLING || "1000" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
