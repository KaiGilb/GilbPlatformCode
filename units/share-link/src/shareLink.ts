export const SHARE_SCHEMA_VERSION = 1;
export const SHARE_FRAGMENT_KEY = "s";
export const SHARE_URL_BUDGET = 2000;
export const OVER_BUDGET_MESSAGE =
  "This view is too large to share as a link yet. Nothing was cut short.";

export const SHARE_PARAM_KEYS = ["pod", "section", "rec", "std", "stab", "rs", "ftab", "rtab", "fv"] as const;
export type ShareParamKey = (typeof SHARE_PARAM_KEYS)[number];

export interface ViewState {
  v: number;
  path: string;
  params: Partial<Record<ShareParamKey, string>>;
}

export type ShareResult =
  | { ok: true; url: string; length: number }
  | { ok: false; reason: "over-budget"; length: number; budget: number };

function isShareParamKey(key: string): key is ShareParamKey {
  return (SHARE_PARAM_KEYS as readonly string[]).includes(key);
}

function safePath(path: unknown): string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

/** Keep only view keys. A token or any other key is left out. */
export function captureViewState(pathname: string, search: string): ViewState {
  const sp = new URLSearchParams(search);
  const params: Partial<Record<ShareParamKey, string>> = {};
  for (const key of SHARE_PARAM_KEYS) {
    const val = sp.get(key);
    if (val !== null && val !== "") params[key] = val;
  }
  return { v: SHARE_SCHEMA_VERSION, path: safePath(pathname), params };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeState(state: ViewState): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)));
}

export function decodeState(blob: string): ViewState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(base64UrlToBytes(blob)));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== SHARE_SCHEMA_VERSION) return null;
  const params: Partial<Record<ShareParamKey, string>> = {};
  if (typeof obj.params === "object" && obj.params !== null) {
    for (const [key, val] of Object.entries(obj.params as Record<string, unknown>)) {
      if (isShareParamKey(key) && typeof val === "string") params[key] = val;
    }
  }
  return { v: SHARE_SCHEMA_VERSION, path: safePath(obj.path), params };
}

/**
 * `appBase` is the public path prefix, with no trailing slash. Pass "" when the app is at the host root.
 * The origin is passed in. This unit does not read the page address itself.
 */
export function buildShareLink(origin: string, pathname: string, search: string, appBase = ""): ShareResult {
  const blob = encodeState(captureViewState(pathname, search));
  const prefix = appBase.replace(/\/$/, "");
  const url = `${origin}${prefix}/#${SHARE_FRAGMENT_KEY}=${blob}`;
  if (url.length > SHARE_URL_BUDGET) {
    return { ok: false, reason: "over-budget", length: url.length, budget: SHARE_URL_BUDGET };
  }
  return { ok: true, url, length: url.length };
}

export function parseShareFragment(hash: string): ViewState | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const blob = new URLSearchParams(raw).get(SHARE_FRAGMENT_KEY);
  return blob ? decodeState(blob) : null;
}

export function viewStateToLocation(state: ViewState): string {
  const sp = new URLSearchParams();
  for (const key of SHARE_PARAM_KEYS) {
    const val = state.params[key];
    if (val !== undefined) sp.set(key, val);
  }
  const qs = sp.toString();
  return qs ? `${safePath(state.path)}?${qs}` : safePath(state.path);
}
