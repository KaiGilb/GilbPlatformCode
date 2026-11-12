import type { StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { splitLogo } from "./splitLogo";

export interface DevServerSaveOptions {
  /** The dev server's save path. Default `/__studio/save` (a path on the page's own origin). */
  endpoint?: string;
  /** Default: the global fetch, looked up per call. */
  fetchImpl?: typeof fetch;
  /** Called with the server's `fontsWarning` when the save worked but the fonts were not all written. */
  onWarning?: (text: string) => void;
}

/**
 * The Studio's `onSave` for an app's dev server: POSTs `splitLogo(sheet)` as JSON (`{ sheet, logoPng? }`) to `endpoint`.
 * On a non-2xx answer it throws `Error(<the answer's message>)` (or "Save failed."), so the Studio's own "failed" line shows it.
 * The dev server side is the app's (a few lines of middleware that write `style.tokens.json` and the logo).
 *
 * @example <StyleStudio appName="MyApp" onSave={makeDevServerSave()} />
 */
export function makeDevServerSave(o: DevServerSaveOptions = {}): (sheet: StyleSheet) => Promise<void> {
  const endpoint = o.endpoint ?? "/__studio/save";
  return async (sheet) => {
    const doFetch = o.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await doFetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(splitLogo(sheet)) });
    } catch {
      throw new Error("The save could not reach the dev server. Is it running?");
    }
    const body = (await res.json().catch(() => ({}))) as { message?: unknown; fontsWarning?: unknown } | null;
    if (!res.ok) throw new Error(typeof body?.message === "string" && body.message ? body.message : "Save failed.");
    if (typeof body?.fontsWarning === "string" && body.fontsWarning) o.onWarning?.(body.fontsWarning);
  };
}
