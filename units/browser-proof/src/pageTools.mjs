// Small helpers bound to one page, for the steps almost every end-to-end proof repeats: wait for something, click it, fill a field the
// way a person would (so React sees it), attach a file, check a picture decoded. App-specific steps stay in the app.

const q = (s) => JSON.stringify(s);

/** The selector for an element with this `data-testid`. */
export const byTestId = (id) => `[data-testid=${q(String(id))}]`;

/**
 * Tools for one page (anything with `eval`, `waitFor` and `send`). Every waiting tool takes a time limit in ms, default 15000.
 * @param {{ eval(e: string): Promise<any>, waitFor(e: string, ms?: number): Promise<any>, send(m: string, p?: any): Promise<any> }} page
 */
export function makeTools(page) {
  const t = {
    byTestId,
    /** Is there an element for this selector right now. */
    exists: (sel) => page.eval(`!!document.querySelector(${q(sel)})`),
    /** Waits until there is one. */
    wait: (sel, ms = 15000) => page.waitFor(`!!document.querySelector(${q(sel)})`, ms),
    /** Waits until there is none. */
    gone: (sel, ms = 15000) => page.waitFor(`!document.querySelector(${q(sel)})`, ms),
    /** Waits for the element, then clicks it. */
    async click(sel, ms = 15000) {
      await t.wait(sel, ms);
      await page.eval(`document.querySelector(${q(sel)}).click()`);
    },
    /**
     * Waits for a clickable thing (button, link, tab, menu item, option, label) whose text includes `text`, then clicks the first.
     * `within` is a selector for the part of the page to look in (the first match of it).
     */
    async clickText(text, { within, timeoutMs = 15000, selector = "button, a, [role=button], [role=tab], [role=menuitem], [role=option], label" } = {}) {
      const find = `(() => { const root = ${within ? `document.querySelector(${q(within)})` : "document"}; if (!root) return null; return [...root.querySelectorAll(${q(selector)})].find((e) => (e.textContent || "").includes(${q(text)})) || null; })()`;
      await page.waitFor(`!!${find}`, timeoutMs);
      await page.eval(`${find}.click()`);
    },
    /** Sets an input, textarea or select the way a person would (the native setter, then input and change events), so React sees it. */
    async set(sel, value, ms = 15000) {
      await t.wait(sel, ms);
      await page.eval(`(() => {
        const el = document.querySelector(${q(sel)});
        const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        el.focus();
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${q(String(value))});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
    },
    /** Waits until the picture (the element, or the first img inside it) is complete and has a real width: it decoded. */
    waitImage: (sel, ms = 20000) =>
      page.waitFor(`(() => { const e = document.querySelector(${q(sel)}); const i = e && (e.tagName === "IMG" ? e : e.querySelector("img")); return !!i && i.complete && i.naturalWidth > 0; })()`, ms),
    /** Puts files on a file input through the DevTools Protocol (`paths` is one path or a list). */
    async setFiles(sel, paths) {
      await t.wait(sel);
      const { root } = await page.send("DOM.getDocument", { depth: 0 });
      const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
      if (!nodeId) throw new Error(`no file input for ${sel}`);
      await page.send("DOM.setFileInputFiles", { nodeId, files: Array.isArray(paths) ? paths : [paths] });
    },
    /** Throws when the page scrolls sideways at this width (default: the window's width). */
    async noHorizontalScroll(width) {
      const m = await page.eval(`({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth })`);
      const limit = width ?? m.inner;
      if (m.doc > limit || m.body > limit) throw new Error(`horizontal scroll: ${JSON.stringify(m)} (wanted <= ${limit})`);
    },
  };
  return t;
}
