// Starts the app for the live sign-in check on localhost:5197 (see vite.live.config.ts).
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function portInUse(port) {
  const [v4, v6] = await Promise.all([probe("127.0.0.1", port), probe("::1", port)]);
  return v4 || v6;
}

export async function main({ port = 5197, spawnFn = spawn, log = console.log, err = console.error } = {}) {
  if (await portInUse(port)) {
    err(`localhost:${port} is already in use (is GilbApp's dev server running?). Stop it, then run npm run dev:live again.`);
    return 1;
  }
  log(`Starting plan-cards-taking-app for the live sign-in check at http://localhost:${port}`);
  log("Production admits this origin; the app's own port 5266 is refused there.");
  log("Settings: type the origin of the TEST vault you named. Writes go only to that vault.");
  log("The code arrives by email. A page reload ends the session (the key lives in memory only).");
  const vite = fileURLToPath(new URL("../node_modules/.bin/vite", import.meta.url));
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const child = spawnFn(vite, ["--config", "vite.live.config.ts"], { cwd, stdio: "inherit" });
  const forward = (signal) => () => child.kill(signal);
  const onInt = forward("SIGINT");
  const onTerm = forward("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  return new Promise((resolve) => {
    child.once("exit", (code) => {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
      resolve(code ?? 1);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
