// Vite plugin: serve the connector file from your app, so people can `curl` it from you (the commands from
// `connectorInstallCommands()` point at it). Plain JavaScript on purpose: Vite loads this before your config is compiled.
//
//   import { gilbConnectorFile } from "@kaigilb/gilbplatformcode-gilb-connector/vite";
//   export default defineConfig({ plugins: [react(), gilbConnectorFile()] });
//
// Build: emits `gilb-connector.mjs` next to your other assets (so it is listed with them and served wherever you
// host the build). Dev: answers `<base>gilb-connector.mjs` from the dev server. `<base>` is Vite's own `base`.
//
// The bytes are the connector file exactly as shipped. Nothing is rewritten.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
/** The name the file is served under. `connectorInstallCommands()` builds its URL from the same name. */
export const CONNECTOR_FILE_NAME = "gilb-connector.mjs";
/** The connector inside this package, next to this plugin. */
export const CONNECTOR_SOURCE = fileURLToPath(new URL("./gilb-connector.mjs", import.meta.url));
/** @returns {import("vite").Plugin} */
export function gilbConnectorFile() {
    const file = () => readFileSync(CONNECTOR_SOURCE);
    let base = "/";
    return {
        name: "gilb-connector-file",
        configResolved(config) {
            base = config.base.startsWith("/") ? config.base.replace(/\/*$/, "/") : "/";
        },
        configureServer(server) {
            server.middlewares.use(`${base}${CONNECTOR_FILE_NAME}`, (_req, res) => {
                res.setHeader("content-type", "text/javascript; charset=utf-8");
                res.end(file());
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: CONNECTOR_FILE_NAME, source: file() });
        },
    };
}
/**
 * The two shell lines a guide shows for `fileUrl` (where the app serves the connector).
 * `fileUrl` must be http(s), its path must end with `/gilb-connector.mjs`, and it must not contain a single quote.
 */
export function connectorInstallCommands(fileUrl) {
    if (fileUrl.includes("'"))
        throw new Error(`Refusing a file URL with a single quote: ${fileUrl}`);
    let parsed;
    try {
        parsed = new URL(fileUrl);
    }
    catch {
        throw new Error(`Not a file URL: ${fileUrl}`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`File URL must use http or https: ${fileUrl}`);
    }
    if (!parsed.pathname.endsWith(`/${CONNECTOR_FILE_NAME}`)) {
        throw new Error(`File URL must end with /${CONNECTOR_FILE_NAME}: ${fileUrl}`);
    }
    return {
        download: `curl -fsSL '${fileUrl}' -o ~/.gilb-connector.mjs`,
        add: "claude mcp add gilb -- node ~/.gilb-connector.mjs",
    };
}
