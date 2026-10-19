/**
 * The script that stops a flash of the wrong theme: it runs in <head> before the page paints, reads the saved
 * choice and puts it on <html>. It is returned as a string for the host to inline (Nuxt: `app.head.script`
 * with `innerHTML`; a plain site: a <script> tag). If the site has a Content-Security-Policy, hash this exact
 * string into it. It is ES5 on purpose and never throws (a blocked store is ignored).
 */
import { themeOptions } from "./theme";
import type { ThemeOptions } from "./types";

/**
 * @param validIds the theme ids the page knows; anything else saved is ignored
 * @param options keys, attribute, accent variable and format; the same object the component gets
 * @returns the script text, with no <script> tags; "<" is escaped so the text can sit in a script element
 */
export function themeHeadScript(validIds: readonly string[], options: Partial<ThemeOptions> = {}): string {
  const o = themeOptions(options);
  const j = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  const valid: Record<string, 1> = {};
  for (const id of validIds) valid[id] = 1;
  const channels = o.accentFormat === "channels";
  return (
    `(function(){try{var d=document.documentElement,t=localStorage.getItem(${j(o.storageKey)}),a=localStorage.getItem(${j(o.accentKey)}),V=${j(valid)};` +
    `if(t&&V[t]===1){d.setAttribute(${j(o.themeAttr)},t);` +
    `if(t===${j(o.customId)}&&a&&/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(a)){var h=a.replace('#','');` +
    `if(h.length===3){h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2]}` +
    (channels
      ? `d.style.setProperty(${j(o.accentVar)},parseInt(h.slice(0,2),16)+' '+parseInt(h.slice(2,4),16)+' '+parseInt(h.slice(4,6),16))`
      : `d.style.setProperty(${j(o.accentVar)},'#'+h.toLowerCase())`) +
    `}}}catch(e){}})();`
  );
}
