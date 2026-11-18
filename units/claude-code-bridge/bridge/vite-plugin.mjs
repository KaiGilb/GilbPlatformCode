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
//
// Self-update (bridge 0.3.16): `updateOrigin` (an https origin) and `updateKeys` ([{ id, key }], 32 raw bytes in base64) are written
// into the `UPDATE_ORIGIN` and `UPDATE_KEYS` lines the same way. Leave them out and that build cannot update itself.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeOrigin } from "./bridge.mjs";
/** The name the file is served under. `bridgeCommands()` builds its URL from the same name. */
export const BRIDGE_FILE_NAME = "claude-code-bridge.mjs";
/** The bridge inside this package. */
export const BRIDGE_SOURCE = fileURLToPath(new URL("./bridge.mjs", import.meta.url));
const DEFAULT_LINE = /^export const DEFAULT_ALLOWED_ORIGINS = \[\];$/gm;
/**
 * The bridge source with `DEFAULT_ALLOWED_ORIGINS` set to the given origins. Each origin is checked with the bridge's own
 * `normalizeOrigin` (and must already be written the way it returns it). Throws if the one line is not found exactly once.
 */
export function injectDefaultAllowedOrigins(source, origins = []) {
    for (const o of origins) {
        if (normalizeOrigin(o) !== o)
            throw new Error(`"${o}" is not written the plain way.`);
    }
    const found = source.match(DEFAULT_LINE)?.length ?? 0;
    if (found !== 1)
        throw new Error(`Expected the line "export const DEFAULT_ALLOWED_ORIGINS = [];" exactly once in the bridge file, found ${found}.`);
    const line = `export const DEFAULT_ALLOWED_ORIGINS = [${origins.map((o) => JSON.stringify(o)).join(", ")}];`;
    return source.replace(DEFAULT_LINE, () => line);
}
const UPDATE_ORIGIN_LINE = /^export const UPDATE_ORIGIN = "";$/gm;
const UPDATE_KEYS_LINE = /^export const UPDATE_KEYS = \[\];$/gm;
const KEY_ID = /^[a-z0-9-]{1,32}$/;
const KEY_B64 = /^[A-Za-z0-9+/]{43}=$/;
/** Throws a clear error for a bad update origin or key list. Returns the plain values to write. */
function checkUpdateOptions(o) {
    let origin = "";
    if (o.updateOrigin !== undefined && o.updateOrigin !== "") {
        let u = null;
        try {
            u = new URL(o.updateOrigin);
        }
        catch {
            /* refused below */
        }
        if (!u || u.protocol !== "https:" || u.origin !== o.updateOrigin)
            throw new Error(`updateOrigin "${o.updateOrigin}" must be an https origin with no path, for example https://app.example.test.`);
        origin = o.updateOrigin;
    }
    const keys = [];
    const seen = new Set();
    for (const k of o.updateKeys ?? []) {
        if (!k || typeof k.id !== "string" || !KEY_ID.test(k.id))
            throw new Error(`updateKeys: the id ${JSON.stringify(k?.id)} must be 1 to 32 characters of a-z, 0-9 and dash.`);
        if (seen.has(k.id))
            throw new Error(`updateKeys: the id "${k.id}" is listed twice.`);
        seen.add(k.id);
        if (typeof k.key !== "string" || !KEY_B64.test(k.key) || Buffer.from(k.key, "base64").length !== 32 || Buffer.from(k.key, "base64").toString("base64") !== k.key)
            throw new Error(`updateKeys: the key "${k.id}" must be 32 raw bytes written as base64.`);
        keys.push({ id: k.id, key: k.key });
    }
    return { origin, keys };
}
const replaceOnce = (source, re, shown, line) => {
    const found = source.match(re)?.length ?? 0;
    if (found !== 1)
        throw new Error(`Expected the line "${shown}" exactly once in the bridge file, found ${found}.`);
    return source.replace(re, () => line);
};
/**
 * The exact bytes a build serves: the bridge source with its three injected lines set. `DEFAULT_ALLOWED_ORIGINS` as before;
 * `UPDATE_ORIGIN` and `UPDATE_KEYS` from `updateOrigin` and `updateKeys` (absent: left empty). Values are written with JSON.stringify.
 * Every line must be found exactly once, and every input is checked, or this throws. Pure: a signing script calls it to get the same bytes.
 */
export function injectBridge(source, o = {}) {
    const { origin, keys } = checkUpdateOptions(o);
    let out = injectDefaultAllowedOrigins(source, o.allowedOrigins ?? []);
    out = replaceOnce(out, UPDATE_ORIGIN_LINE, 'export const UPDATE_ORIGIN = "";', `export const UPDATE_ORIGIN = ${JSON.stringify(origin)};`);
    out = replaceOnce(out, UPDATE_KEYS_LINE, "export const UPDATE_KEYS = [];", `export const UPDATE_KEYS = ${JSON.stringify(keys)};`);
    return out;
}
/** @returns {import("vite").Plugin} */
export function claudeCodeBridgeFile(opts = {}) {
    const inject = { allowedOrigins: opts.defaultAllowedOrigins ?? opts.allowedOrigins ?? [], updateOrigin: opts.updateOrigin, updateKeys: opts.updateKeys };
    // Refuse a bad origin or key at start-up, before any file is read.
    injectBridge('export const DEFAULT_ALLOWED_ORIGINS = [];\nexport const UPDATE_ORIGIN = "";\nexport const UPDATE_KEYS = [];', inject);
    const file = () => Buffer.from(injectBridge(readFileSync(BRIDGE_SOURCE, "utf8"), inject), "utf8");
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
