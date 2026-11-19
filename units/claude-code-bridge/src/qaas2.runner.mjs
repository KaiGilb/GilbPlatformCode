// Test helper (not a test): runs a bridge in its own process so a test can kill it hard. Never main(); no real dialog, no real home.
import path from "node:path";
import { createBridge, installProcessHandlers } from "../bridge/bridge.mjs";
const [dir, home, stateDir, fake, logFile, workspace] = process.argv.slice(2);
const APP = "http://localhost:5197";
const b = createBridge({
  port: 0, claudeBin: fake, allowedOrigins: [APP], workDir: path.join(dir, "work"), home, stateDir, workspace,
  fullAccess: process.env.RUN_FULL === "1", codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", killGraceMs: 300, snapshotMs: 100,
  accessDialog: async () => "cancel",
  env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
});
await b.start();
const res = await fetch(`http://127.0.0.1:${b.port}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ code: b.pairingCode }) });
console.log(JSON.stringify({ port: b.port, secret: (await res.json()).secret }));
installProcessHandlers(b); // what main() does: SIGINT / SIGTERM / SIGHUP close the bridge, exit kills what is left
setInterval(() => {}, 1000);
