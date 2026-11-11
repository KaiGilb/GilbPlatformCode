// Browser runtime (no React). One <style id="gilb-style"> in <head>, textContent only.
import { toCssText } from "./css";
import { validateStyleSheet, type StyleSheet } from "./schema";

export const STYLE_ELEMENT_ID = "gilb-style";

export function applyStyleSheet(sheet: StyleSheet, doc: Document = document): void {
  const css = toCssText(sheet); // validates first, throws on invalid input
  let el = doc.getElementById(STYLE_ELEMENT_ID);
  if (!el) {
    el = doc.createElement("style");
    el.id = STYLE_ELEMENT_ID;
    doc.head.appendChild(el);
  }
  el.textContent = css;
}

export type LoadSource = "cache" | "remote" | "fallback" | "none";

export interface LoadStyleOptions {
  fetchRemote: (signal?: AbortSignal) => Promise<unknown>;
  /** The app's own style.tokens.json, used only when the remote fails and nothing was cached. */
  fallbackUrl?: string;
  cacheKey: string;
  doc?: Document;
  storage?: Pick<Storage, "getItem" | "setItem">;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface LoadStyleResult {
  source: LoadSource;
  errors: string[];
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${ms}ms`));
      ctl.abort();
    }, ms);
  });
  try {
    return await Promise.race([run(ctl.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function loadStyle(opts: LoadStyleOptions): Promise<LoadStyleResult> {
  const errors: string[] = [];
  let source: LoadSource = "none";
  const doc = opts.doc ?? (typeof document !== "undefined" ? document : undefined);
  const storage = opts.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  const timeoutMs = opts.timeoutMs ?? 2500;
  if (!doc) return { source, errors: ["no document available"] };

  // (a) cache, applied synchronously (before the first await) so there is no flash
  try {
    const raw = storage?.getItem(opts.cacheKey);
    if (raw) {
      const v = validateStyleSheet(JSON.parse(raw));
      if (v.ok) {
        applyStyleSheet(v.value, doc);
        source = "cache";
      } else errors.push(...v.errors.map((e) => `cache: ${e}`));
    }
  } catch (e) {
    errors.push(`cache: ${msg(e)}`);
  }

  // (b) remote
  try {
    const data = await withTimeout((signal) => opts.fetchRemote(signal), timeoutMs);
    const v = validateStyleSheet(data);
    if (v.ok) {
      applyStyleSheet(v.value, doc);
      source = "remote";
      try {
        storage?.setItem(opts.cacheKey, JSON.stringify(v.value));
      } catch (e) {
        errors.push(`cache write: ${msg(e)}`);
      }
      return { source, errors };
    }
    errors.push(...v.errors.map((e) => `remote: ${e}`));
  } catch (e) {
    errors.push(`remote: ${msg(e)}`);
  }

  // (c) fallback, only when nothing is showing yet
  if (source === "none" && opts.fallbackUrl) {
    try {
      const f = opts.fetchImpl ?? fetch;
      const url = opts.fallbackUrl;
      const data = await withTimeout(async (signal) => {
        const res = await f(url, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      }, timeoutMs);
      const v = validateStyleSheet(data);
      if (v.ok) {
        applyStyleSheet(v.value, doc);
        source = "fallback";
      } else errors.push(...v.errors.map((e) => `fallback: ${e}`));
    } catch (e) {
      errors.push(`fallback: ${msg(e)}`);
    }
  }
  return { source, errors };
}
