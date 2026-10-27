// Vite plugin: serve the bridge file from your app, so people can `curl` it from you (the commands from
// `bridgeCommands()` point at it). Plain JavaScript on purpose: Vite loads this before your config is compiled.
//
//   import { claudeCodeBridgeFile } from "gilb-claude-code/vite";
//   export default defineConfig({ plugins: [react(), claudeCodeBridgeFile()] });
//
// Build: emits `claude-code-bridge.mjs` next to your other assets (so it is listed with them and served wherever you
// host the build). Dev: answers `<base>claude-code-bridge.mjs` from the dev server. `<base>` is Vite's own `base`.
//
// The bridge ships with NO default origins. Pass yours: claudeCodeBridgeFile({ defaultAllowedOrigins: ["https://app.example.test"] }).
// They are written into the one `export const DEFAULT_ALLOWED_ORIGINS = [];` line of the served file, and each must pass
// the bridge's own `normalizeOrigin`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { normalizeOrigin } from "./bridge.js";

/** The name the file is served under. `bridgeCommands()` builds its URL from the same name. */
export const BRIDGE_FILE_NAME = "claude-code-bridge.mjs";

/** The bridge inside this package. */
export const BRIDGE_SOURCE = fileURLToPath(new URL("./bridge.mjs", import.meta.url));

const DEFAULT_LINE = /^export const DEFAULT_ALLOWED_ORIGINS = \[\];$/gm;

/**
 * The bridge source with `DEFAULT_ALLOWED_ORIGINS` set to the given origins. Each origin is checked with the bridge's own
 * `normalizeOrigin` (and must already be written the way it returns it). Throws if the one line is not found exactly once.
 */
export function injectDefaultAllowedOrigins(source: string, origins: readonly string[] = []): string {
  for (const o of origins) {
    if (normalizeOrigin(o) !== o) throw new Error(`"${o}" is not written the plain way.`);
  }
  const found = source.match(DEFAULT_LINE)?.length ?? 0;
  if (found !== 1) throw new Error(`Expected the line "export const DEFAULT_ALLOWED_ORIGINS = [];" exactly once in the bridge file, found ${found}.`);
  const line = `export const DEFAULT_ALLOWED_ORIGINS = [${origins.map((o) => JSON.stringify(o)).join(", ")}];`;
  return source.replace(DEFAULT_LINE, () => line);
}

/** @returns {import("vite").Plugin} */
export function claudeCodeBridgeFile(opts: { defaultAllowedOrigins?: readonly string[] | undefined } = {}): Plugin {
  const origins = opts.defaultAllowedOrigins ?? [];
  injectDefaultAllowedOrigins("export const DEFAULT_ALLOWED_ORIGINS = [];", origins); // refuse a bad origin at start-up
  const file = () => Buffer.from(injectDefaultAllowedOrigins(readFileSync(BRIDGE_SOURCE, "utf8"), origins), "utf8");
  let base = "/";
  return {
    name: "gilb-claude-code-bridge-file",
    configResolved(config) {
      base = config.base.startsWith("/") ? config.base.replace(/\/*$/, "/") : "/";
    },
    configureServer(server) {
      server.middlewares.use(`${base}${BRIDGE_FILE_NAME}`, (_req, res) => {
        res.setHeader("content-type", "text/javascript; charset=utf-8");
        res.end(file());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: BRIDGE_FILE_NAME, source: file() });
    },
  };
}
