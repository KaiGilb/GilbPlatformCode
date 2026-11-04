import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import axe from "axe-core";
import ShimmerHeadline from "./ShimmerHeadline.vue";

const SWEEP_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .sh.sh--sweeping {
    background-image: linear-gradient(
      100deg,
      var(--site-block-fg, #1a1a1a) 0%,
      var(--site-block-fg, #1a1a1a) 40%,
      var(--site-block-shimmer, var(--site-block-accent, #2563eb)) 50%,
      var(--site-block-fg, #1a1a1a) 60%,
      var(--site-block-fg, #1a1a1a) 100%
    );
    background-size: 300% 100%;
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    animation: sh-sweep 3.2s ease-in-out both;
  }
  .sh.sh--dark.sh--sweeping {
    background-image: linear-gradient(
      100deg,
      var(--site-block-bg, #ffffff) 0%,
      var(--site-block-bg, #ffffff) 40%,
      var(--site-block-shimmer, var(--site-block-accent, #2563eb)) 50%,
      var(--site-block-bg, #ffffff) 60%,
      var(--site-block-bg, #ffffff) 100%
    );
  }
}
@keyframes sh-sweep {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}
`;

/** Comment-stripped `<style scoped>` text. */
function styleText(): string {
  const sfc = readFileSync(join(process.cwd(), "src", "ShimmerHeadline.vue"), "utf8");
  const style = (sfc.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
  return style.replace(/\/\*[\s\S]*?\*\//g, "");
}

function flat(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

type Entry = { isIntersecting: boolean; target: Element };

/** Records each instance. A disconnected observer delivers nothing, as in the browser. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit | undefined;
  readonly targets: Element[] = [];
  disconnectCalls = 0;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnectCalls += 1;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  fire(entries: Entry[]): void {
    if (this.disconnectCalls > 0) return;
    this.callback(entries as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

let reduced = false;
let wrapper: VueWrapper | undefined;

function mountHeadline(props?: Record<string, unknown>, slot = "Build applications you can keep."): HTMLElement {
  wrapper?.unmount();
  wrapper = mount(ShimmerHeadline, {
    props,
    slots: { default: slot },
    attachTo: document.body,
  });
  return wrapper.element as HTMLElement;
}

function observer(): FakeIntersectionObserver {
  const inst = FakeIntersectionObserver.instances.at(-1);
  if (!inst) throw new Error("no IntersectionObserver was created");
  return inst;
}

function animationEnd(name: string): Event {
  const event = new Event("animationend");
  Object.defineProperty(event, "animationName", { value: name });
  return event;
}

beforeEach(() => {
  reduced = false;
  FakeIntersectionObserver.instances = [];
  document.documentElement.lang = "en";
  document.title = "Shimmer";
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  // Restore spies before the fake clock uninstalls. A spy on setTimeout hides the
  // flag the clock uses to put the real timer back, so a later real-timer test hangs.
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reduced = false;
});

test("renders the tag with class sh and the slot, plain: no sweeping class at mount", () => {
  const el = mountHeadline();
  expect(el.tagName).toBe("H2");
  expect(el.classList.contains("sh")).toBe(true);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
  expect(el.textContent).toBe("Build applications you can keep.");
  const h1 = mountHeadline({ tag: "h1" }, "Title");
  expect(h1.tagName).toBe("H1");
  expect(h1.classList.contains("sh")).toBe(true);
  expect(h1.classList.contains("sh--sweeping")).toBe(false);
  expect(h1.textContent).toBe("Title");
});

test("onDark adds sh--dark", () => {
  const plain = mountHeadline();
  expect(plain.classList.contains("sh--dark")).toBe(false);
  const el = mountHeadline({ onDark: true });
  expect(el.classList.contains("sh--dark")).toBe(true);
});

test("observes its own element once, with the source's line: rootMargin 0px 0px -8% 0px, threshold 0.05", () => {
  const el = mountHeadline();
  expect(FakeIntersectionObserver.instances).toHaveLength(1);
  const inst = observer();
  expect(inst.targets).toEqual([el]);
  expect(inst.options).toEqual({ rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
});

test("not intersecting does nothing; the first intersection disconnects the observer and starts the sweep 220ms later", () => {
  const el = mountHeadline();
  const inst = observer();
  inst.fire([{ isIntersecting: false, target: el }]);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
  expect(inst.disconnectCalls).toBe(0);
  inst.fire([{ isIntersecting: true, target: el }]);
  expect(inst.disconnectCalls).toBe(1);
  vi.advanceTimersByTime(219);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
  vi.advanceTimersByTime(1);
  expect(el.classList.contains("sh--sweeping")).toBe(true);
});

test("animationend of the sweep settles it to plain text, matched by name part because Vue scopes keyframe names", () => {
  const el = mountHeadline();
  observer().fire([{ isIntersecting: true, target: el }]);
  vi.advanceTimersByTime(220);
  expect(el.classList.contains("sh--sweeping")).toBe(true);
  el.dispatchEvent(animationEnd("other"));
  expect(el.classList.contains("sh--sweeping")).toBe(true);
  el.dispatchEvent(animationEnd("sh-sweep-data-v-1234"));
  expect(el.classList.contains("sh--sweeping")).toBe(false);
});

test("if animationend never comes, it settles 3.8s after the pass starts", () => {
  const el = mountHeadline();
  observer().fire([{ isIntersecting: true, target: el }]);
  vi.advanceTimersByTime(220);
  expect(el.classList.contains("sh--sweeping")).toBe(true);
  vi.advanceTimersByTime(3799);
  expect(el.classList.contains("sh--sweeping")).toBe(true);
  vi.advanceTimersByTime(1);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
});

test("once only: a second intersection after settling does not sweep again", () => {
  const el = mountHeadline();
  const inst = observer();
  inst.fire([{ isIntersecting: true, target: el }]);
  vi.advanceTimersByTime(220);
  expect(el.classList.contains("sh--sweeping")).toBe(true);
  vi.advanceTimersByTime(3800);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
  expect(FakeIntersectionObserver.instances).toHaveLength(1);
  inst.fire([{ isIntersecting: true, target: el }]);
  vi.advanceTimersByTime(220);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
});

test("reduced motion: no observer is created and the text stays plain", () => {
  reduced = true;
  const el = mountHeadline();
  expect(FakeIntersectionObserver.instances).toHaveLength(0);
  expect(el.classList.contains("sh")).toBe(true);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
  expect(el.textContent).toBe("Build applications you can keep.");
  vi.advanceTimersByTime(5000);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
});

test("no IntersectionObserver in window: nothing is armed and the text stays plain", () => {
  delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  expect("IntersectionObserver" in window).toBe(false);
  const el = mountHeadline();
  expect(FakeIntersectionObserver.instances).toHaveLength(0);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
  expect(el.textContent).toBe("Build applications you can keep.");
  vi.advanceTimersByTime(5000);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
});

test("unmount before the start timer fires: nothing sweeps, the observer is disconnected and no listener is left", () => {
  // vue-test-utils removes its own animationend listener on unmount. Count the unit's function, not the event type.
  const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
  const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener");
  const el = mountHeadline();
  const inst = observer();
  const addClass = vi.spyOn(el.classList, "add");
  const libraryFns = add.mock.calls.filter((c) => c[0] === "animationend").map((c) => c[1]);
  inst.fire([{ isIntersecting: true, target: el }]);
  expect(inst.disconnectCalls).toBe(1);
  wrapper?.unmount();
  wrapper = undefined;
  vi.advanceTimersByTime(5000);
  expect(addClass.mock.calls.some((call) => (call as string[]).includes("sh--sweeping"))).toBe(false);
  expect(el.classList.contains("sh--sweeping")).toBe(false);
  const trace = [
    ...add.mock.invocationCallOrder.map((order, i) => ({ order, type: add.mock.calls[i]?.[0], fn: add.mock.calls[i]?.[1], kind: "add" as const })),
    ...remove.mock.invocationCallOrder.map((order, i) => ({ order, type: remove.mock.calls[i]?.[0], fn: remove.mock.calls[i]?.[1], kind: "remove" as const })),
  ]
    .filter((event) => event.type === "animationend" && event.fn !== undefined && !libraryFns.some((fn) => fn === event.fn))
    .sort((a, b) => a.order - b.order);
  let left = 0;
  for (const event of trace) left = event.kind === "add" ? left + 1 : Math.max(0, left - 1);
  expect(left).toBe(0);
  expect(trace.some((event) => event.kind === "remove")).toBe(true);
});

test("unmount before the heading is ever seen disconnects the observer", () => {
  mountHeadline();
  const inst = observer();
  expect(inst.disconnectCalls).toBe(0);
  wrapper?.unmount();
  wrapper = undefined;
  expect(inst.disconnectCalls).toBe(1);
});

test("an animationend whose name holds sh but is not the sweep does not settle it", () => {
  const el = mountHeadline();
  observer().fire([{ isIntersecting: true, target: el }]);
  vi.advanceTimersByTime(220);
  expect(el.classList.contains("sh--sweeping")).toBe(true);
  for (const name of ["flash", "shake-data-v-1", "fade-sh"]) el.dispatchEvent(animationEnd(name));
  expect(el.classList.contains("sh--sweeping")).toBe(true);
});

test("settle and an unmount mid-sweep each remove the listener the unit added", () => {
  const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
  const rem = vi.spyOn(HTMLElement.prototype, "removeEventListener");
  const own = () => add.mock.calls.filter((c) => c[0] === "animationend").map((c) => c[1]);
  const removed = () => rem.mock.calls.filter((c) => c[0] === "animationend").map((c) => c[1]);
  let el = mountHeadline();
  observer().fire([{ isIntersecting: true, target: el }]);
  vi.advanceTimersByTime(220);
  const fn1 = own().at(-1);
  expect(fn1).toBeTypeOf("function");
  el.dispatchEvent(animationEnd("sh-sweep-x"));
  expect(removed()).toContain(fn1);
  add.mockClear();
  rem.mockClear();
  el = mountHeadline();
  observer().fire([{ isIntersecting: true, target: el }]);
  vi.advanceTimersByTime(1000);
  const fn2 = own().at(-1);
  expect(fn2).toBeTypeOf("function");
  wrapper?.unmount();
  wrapper = undefined;
  expect(removed()).toContain(fn2);
});

test("the heading template has no inline style and no wrapper around the slot", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "ShimmerHeadline.vue"), "utf8");
  const tpl = (sfc.split("<template>")[1] ?? "").split("</template>")[0] ?? "";
  expect(tpl.replace(/\s+/g, " ").trim()).toBe(
    `<component :is="tag" ref="el" class="sh" :class="{ 'sh--dark': onDark }"><slot /></component>`,
  );
  const el = mountHeadline(undefined, "T");
  expect(el.getAttribute("style")).toBeNull();
  expect(el.children.length).toBe(0);
  expect(el.textContent).toBe("T");
});

test("server-rendered HTML is the plain heading", async () => {
  const html = await renderToString(
    createSSRApp({
      render: () => h(ShimmerHeadline, null, { default: () => "Build applications you can keep." }),
    }),
  );
  expect(html).toContain('<h2 class="sh"');
  expect(html).toContain("Build applications you can keep.");
  expect(html).not.toContain("sh--sweeping");
});

test("the sweep styles are the source's, on the site-block variables", () => {
  expect(flat(styleText())).toBe(flat(SWEEP_CSS));
});

test("unmount during the sweep clears the settle net", () => {
  const setTimeoutSpy = vi.spyOn(window, "setTimeout");
  const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
  const el = mountHeadline();
  observer().fire([{ isIntersecting: true, target: el }]);
  vi.advanceTimersByTime(220);
  expect(el.classList.contains("sh--sweeping")).toBe(true);
  const settleIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 3800);
  expect(settleIndex).toBeGreaterThanOrEqual(0);
  const settleId = setTimeoutSpy.mock.results[settleIndex]?.value;
  wrapper?.unmount();
  wrapper = undefined;
  expect(clearTimeoutSpy).toHaveBeenCalledWith(settleId);
});

test("whole-style: the style block is exactly the rules this file means", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "ShimmerHeadline.vue"), "utf8");
  const style = (sfc.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
  const normalized = style.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  expect(normalized).toBe(
    "@media (prefers-reduced-motion: no-preference) { .sh.sh--sweeping { background-image: linear-gradient( 100deg, var(--site-block-fg, #1a1a1a) 0%, var(--site-block-fg, #1a1a1a) 40%, var(--site-block-shimmer, var(--site-block-accent, #2563eb)) 50%, var(--site-block-fg, #1a1a1a) 60%, var(--site-block-fg, #1a1a1a) 100% ); background-size: 300% 100%; background-repeat: no-repeat; -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent; animation: sh-sweep 3.2s ease-in-out both; } .sh.sh--dark.sh--sweeping { background-image: linear-gradient( 100deg, var(--site-block-bg, #ffffff) 0%, var(--site-block-bg, #ffffff) 40%, var(--site-block-shimmer, var(--site-block-accent, #2563eb)) 50%, var(--site-block-bg, #ffffff) 60%, var(--site-block-bg, #ffffff) 100% ); } } @keyframes sh-sweep { from { background-position: 100% 0; } to { background-position: 0% 0; } }",
  );
});

test("README Host must supply lists exactly the variables the style reads", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "ShimmerHeadline.vue"), "utf8");
  const css = ((sfc.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const inStyle = [...new Set([...css.matchAll(/--site-block-[a-z-]+/g)].map((m) => m[0]))].sort();
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
  expect(readme.includes("## Host must supply")).toBe(true);
  const section = (readme.split("## Host must supply")[1] ?? "").split(/\n## /)[0] ?? "";
  const listed = [
    ...new Set(
      section
        .split("\n")
        .filter((line) => line.trimStart().startsWith("- "))
        .flatMap((line) => {
          let rest = line.trimStart().slice(2);
          const names: string[] = [];
          for (;;) {
            const found = rest.match(/^`(--site-block-[a-z-]+)`/);
            if (!found?.[1]) break;
            names.push(found[1]);
            rest = rest.slice(found[0].length).replace(/^[\s,]+/, "");
          }
          if (names.length === 0) throw new Error(`bullet does not start with a variable: ${line}`);
          return names;
        }),
    ),
  ].sort();
  expect(listed).toEqual(inStyle);
});

test("axe finds no violations", async () => {
  vi.useRealTimers();
  const main = document.createElement("main");
  const h1 = document.createElement("h1");
  h1.textContent = "Page";
  main.appendChild(h1);
  document.body.appendChild(main);
  wrapper = mount(ShimmerHeadline, {
    slots: { default: "Build applications you can keep." },
    attachTo: main,
  });
  const results = await axe.run(document.body);
  expect(results.violations).toEqual([]);
});
