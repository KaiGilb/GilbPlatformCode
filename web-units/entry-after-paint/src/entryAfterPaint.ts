/**
 * Load a page's entry script after first paint, and hold a form submit made before the page's script is ready.
 * Moved without change in behaviour from the Gilb Websites site (server/lib/entry-after-paint.mjs; see README
 * "Source"). Pure strings in, strings out: no Nitro, no Nuxt, no browser needed to run it.
 *
 * WHY. The entry chunk is a <script type="module"> in <head>. It downloads during first paint and competes with
 * the HTML, CSS and fonts of the page's largest content, although nothing visible needs it while hydration waits
 * for the first interaction anyway. Moving it after first paint is a measured speed gain (see README "Source").
 *
 * WHAT. The entry tag is replaced by one small inline script that (1) adds the SAME module script once the page
 * has loaded, or at the visitor's first pointer, touch, key, focus, scroll, wheel or mouse event, or after
 * `FALLBACK_MS` at the latest, and never before DOMContentLoaded; and (2) holds any submit of a form marked
 * `data-sc-guard` until the page's script owns that form: the submit is cancelled (no navigation, nothing typed is
 * lost), the form is marked `data-sc-pending` and `aria-busy`, and the download starts at once. The form's own
 * code calls `claimGuardedForm(form)` when it mounts, which tells the guard to step aside (`data-sc-live`) and says
 * whether to replay a held submit.
 *
 * SAFE, AND NOT SILENT. If the framework changes the tag's markup, nothing matches and the page ships exactly as
 * before, only slower. That is safe but it is silent, so `entryStatus` reads a rendered page and says plainly
 * whether the entry was moved, and `scripts/check-rendered-entry.mjs` fails a build whose pages were not.
 */

/** The entry tag Nuxt 3.21 renders into <head> (one per page). Matched exactly on purpose. */
export const ENTRY_TAG = /<script type="module" src="(\/_nuxt\/[^"]+\.js)" crossorigin><\/script>/;

/** Latest moment the entry is fetched with no load event and no interaction (ms after <head>). */
export const FALLBACK_MS = 3000;

/** Events that start the entry download (a superset of the usual hydration-delay triggers). */
export const TRIGGER_EVENTS = ["pointerdown", "touchstart", "keydown", "focusin", "mousemove", "scroll", "wheel", "click"];

/** The attributes shared by the loader and the form. */
export const GUARD = { guard: "data-sc-guard", pending: "data-sc-pending", live: "data-sc-live" } as const;

/** Written first in every loader, so a rendered page can be checked without trusting `ENTRY_TAG`. */
export const LOADER_MARK = "/*entry-after-paint*/";

/**
 * Browser code for one entry URL. ES5 on purpose: it runs before any bundle.
 *
 * @param src the entry's URL, as the tag had it
 * @returns script text, with no <script> tags; "<" is escaped so it can sit in a script element
 */
export function loaderScript(src: string): string {
  const j = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  return (
    `${LOADER_MARK}(function(){var w=window,d=document,started=false;` +
    `function add(){var s=d.createElement('script');s.type='module';s.crossOrigin='anonymous';s.src=${j(src)};d.head.appendChild(s)}` +
    `function load(){if(started)return;started=true;if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',add,{once:true});else add()}` +
    `w.addEventListener('load',load,{once:true});` +
    `${j(TRIGGER_EVENTS)}.forEach(function(e){w.addEventListener(e,load,{capture:true,once:true,passive:true})});` +
    `setTimeout(load,${FALLBACK_MS});` +
    `d.addEventListener('submit',function(e){var f=e.target;` +
    `if(!f||!f.hasAttribute||!f.hasAttribute('${GUARD.guard}')||f.hasAttribute('${GUARD.live}'))return;` +
    `e.preventDefault();f.setAttribute('${GUARD.pending}','');f.setAttribute('aria-busy','true');load()},true)})();`
  );
}

/** Replace the entry tag in one HTML chunk; returns the chunk unchanged when it has none. */
export function rewriteEntry(html: string): string {
  return html.replace(ENTRY_TAG, (_m, src: string) => `<script>${loaderScript(src)}</script>`);
}

/** The two arrays a Nitro `render:html` hook hands over. */
export interface RenderParts {
  head: string[];
  bodyAppend: string[];
}

/** For the host's Nitro plugin: rewrite the entry in the head and the end of the body, in place. */
export function rewriteRenderParts(parts: RenderParts): void {
  parts.head = parts.head.map(rewriteEntry);
  parts.bodyAppend = parts.bodyAppend.map(rewriteEntry);
}

/** What a rendered page shows about the entry. */
export type EntryStatus = "moved" | "unmoved" | "none";

/**
 * Read a rendered page. `moved`: our loader is in it and no module entry tag from `/_nuxt/` is left. `unmoved`:
 * a module script from `/_nuxt/` is still in the page, so the rewrite did not match (the framework's markup
 * changed). `none`: neither (a page with no script, or another build layout).
 */
export function entryStatus(html: string): EntryStatus {
  const left = /<script\b[^>]*\btype=["']?module["']?[^>]*\bsrc=["']?\/_nuxt\//i.test(html) || /<script\b[^>]*\bsrc=["']?\/_nuxt\/[^>]*\btype=["']?module/i.test(html);
  if (left) return "unmoved";
  return html.includes(LOADER_MARK) ? "moved" : "none";
}

/** The part of a form a guard needs; a DOM element satisfies it. */
export interface GuardedForm {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
}

/**
 * Call when the page's script takes over a guarded form (its mounted hook). The guard steps aside from now on
 * (`data-sc-live`), `aria-busy` is cleared, and the return value says whether a submit was held and must be
 * replayed now (and clears the marker).
 *
 * @returns true when the visitor pressed submit before the script was ready
 */
export function claimGuardedForm(form: GuardedForm): boolean {
  form.setAttribute(GUARD.live, "");
  form.removeAttribute("aria-busy");
  if (!form.hasAttribute(GUARD.pending)) return false;
  form.removeAttribute(GUARD.pending);
  return true;
}
