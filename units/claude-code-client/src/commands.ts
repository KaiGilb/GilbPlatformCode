// The commands the person pastes in Terminal. They download the bridge from the APP that is showing them (so the app
// decides what runs, and the file is the one it shipped) and run it.

/** The file name an app serves the bridge under. Serve `bridge/bridge.mjs` from this package under this name. */
export const BRIDGE_FILE_NAME = "claude-code-bridge.mjs";

/** Where the downloaded bridge lives on the person's computer. */
export const BRIDGE_LOCAL_PATH = "~/.gilb-claude-code-bridge.mjs";

export interface BridgeCommandsOpts {
  /** The app's origin (no path), e.g. `window.location.origin`. */
  origin: string;
  /** Where the app serves its files from, e.g. Vite's `import.meta.env.BASE_URL`. Default "/". */
  basePath?: string;
  /** Overrides `origin` + `basePath`: the full URL of the served bridge file. */
  bridgeFileUrl?: string;
  /**
   * The app's own origin, to be allowed by the bridge (`--allow-origin`, kept by `--install`). REQUIRED for every app but
   * the Gilb ones the bridge already lists: without it the bridge refuses the app's page. Pass `window.location.origin`.
   */
  allowOrigin?: string;
}

export interface BridgeCommands {
  /** One-off: download and run in this Terminal window. */
  start: string;
  /** Always on (macOS): download, then install a login item that keeps the bridge running. */
  install: string;
  /** Prints the current pairing code when the bridge runs without a window. */
  code: string;
}

/** Only characters an origin has, so a value can never carry shell syntax into the line the person pastes. */
const SHELL_SAFE = /^[A-Za-z0-9:/._\-[\]]+$/;

function checked(label: string, value: string): string {
  if (!SHELL_SAFE.test(value) || !/^https?:\/\/[^/]/.test(value)) {
    throw new Error(`${label} must be a plain http(s) URL such as https://app.example.com; got ${JSON.stringify(value)}`);
  }
  return value;
}

function originOf(label: string, value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${label} must be an origin such as https://app.example.com (use window.location.origin); got ${JSON.stringify(value)}`);
  }
}

export function bridgeFileUrl(origin: string, basePath = "/"): string {
  const trimmed = basePath.replace(/^\/+|\/+$/g, "");
  const base = trimmed ? `/${trimmed}/` : "/";
  return `${origin.replace(/\/+$/, "")}${base}${BRIDGE_FILE_NAME}`;
}

export function bridgeCommands(opts: BridgeCommandsOpts): BridgeCommands {
  const url = checked("The bridge file URL (origin, basePath or bridgeFileUrl)", opts.bridgeFileUrl ?? bridgeFileUrl(opts.origin, opts.basePath));
  const allow = opts.allowOrigin ? ` --allow-origin ${checked("allowOrigin", originOf("allowOrigin", opts.allowOrigin))}` : "";
  const get = `curl -fsSL ${url} -o ${BRIDGE_LOCAL_PATH}`;
  return {
    start: `${get} && node ${BRIDGE_LOCAL_PATH}${allow}`,
    install: `${get} && node ${BRIDGE_LOCAL_PATH} --install${allow}`,
    code: `node ${BRIDGE_LOCAL_PATH} --code`,
  };
}
