// The Turnstile loader is tested with a fake IntersectionObserver and a script tag.
// Nothing is fetched: the tag is inserted and left for the test to fire `load`.
import { afterEach, describe, expect, test } from "vitest";
import { createTurnstile, DEFAULT_TURNSTILE_SCRIPT_URL, type TurnstileOptions } from "./turnstile";

const SRC = "https://cdn.example.test/turnstile.js";

class FakeIO {
  static instances: FakeIO[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly rootMargin: string;
  observed: Element | undefined;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = String(options?.rootMargin ?? "");
    FakeIO.instances.push(this);
  }
  observe(el: Element): void {
    this.observed = el;
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  fire(isIntersecting: boolean): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

let savedObserver: PropertyDescriptor | undefined;

function scripts(): string[] {
  return [...document.scripts].map((script) => script.getAttribute("src") ?? "");
}

function mountPair(): { form: HTMLFormElement; box: HTMLElement } {
  const form = document.createElement("form");
  const box = document.createElement("div");
  form.appendChild(box);
  document.body.appendChild(form);
  return { form, box };
}

function options(over: Partial<TurnstileOptions> = {}): TurnstileOptions {
  const { form, box } = mountPair();
  return { siteKey: "site-key", scriptUrl: SRC, form, box, tokenWaitMs: 8000, ...over };
}

function useObserver(value: unknown): void {
  Object.defineProperty(window, "IntersectionObserver", { configurable: true, writable: true, value });
}

afterEach(() => {
  document.body.innerHTML = "";
  for (const script of [...document.scripts]) script.remove();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  FakeIO.instances = [];
  if (savedObserver) Object.defineProperty(window, "IntersectionObserver", savedObserver);
  else delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  savedObserver = undefined;
});

describe("createTurnstile", () => {
  test("the default script address is Turnstile's explicit-render URL", () => {
    expect(DEFAULT_TURNSTILE_SCRIPT_URL).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );
  });

  test("no key: watch, focus and a token wait never add a script", async () => {
    savedObserver = Object.getOwnPropertyDescriptor(window, "IntersectionObserver");
    useObserver(FakeIO);
    const controller = createTurnstile(options({ siteKey: "" }));
    controller.watch();
    controller.notifyFocus();
    FakeIO.instances[0]?.fire(true);
    await expect(controller.waitForToken()).rejects.toThrow(/token/);
    expect(scripts()).toEqual([]);
    controller.dispose();
  });

  test("with a key, the script loads when the form comes within one viewport", () => {
    savedObserver = Object.getOwnPropertyDescriptor(window, "IntersectionObserver");
    useObserver(FakeIO);
    const pair = mountPair();
    const controller = createTurnstile({ siteKey: "site-key", scriptUrl: SRC, ...pair, tokenWaitMs: 8000 });
    controller.watch();
    expect(scripts()).toEqual([]);
    const io = FakeIO.instances[0];
    expect(io).toBeDefined();
    expect(io!.rootMargin).toBe("100% 0px");
    expect(io!.observed).toBe(pair.form);
    io!.fire(false);
    expect(scripts()).toEqual([]);
    io!.fire(true);
    expect(scripts()).toEqual([SRC]);
    expect(document.head.querySelector("script")).not.toBeNull();
    controller.dispose();
  });

  test("the first focus loads it earlier, and a later intersection does not load it again", () => {
    savedObserver = Object.getOwnPropertyDescriptor(window, "IntersectionObserver");
    useObserver(FakeIO);
    const controller = createTurnstile(options());
    controller.watch();
    expect(scripts()).toEqual([]);
    controller.notifyFocus();
    expect(scripts()).toEqual([SRC]);
    controller.notifyFocus();
    FakeIO.instances[0]?.fire(true);
    expect(scripts()).toEqual([SRC]);
    controller.dispose();
  });

  test("it loads once only", () => {
    savedObserver = Object.getOwnPropertyDescriptor(window, "IntersectionObserver");
    useObserver(FakeIO);
    const controller = createTurnstile(options());
    controller.notifyFocus();
    controller.notifyFocus();
    controller.watch();
    FakeIO.instances.at(-1)?.fire(true);
    expect(scripts()).toEqual([SRC]);
    controller.dispose();
  });

  test("with no IntersectionObserver it loads as soon as watch runs", () => {
    savedObserver = Object.getOwnPropertyDescriptor(window, "IntersectionObserver");
    useObserver(undefined);
    const controller = createTurnstile(options());
    controller.watch();
    expect(scripts()).toEqual([SRC]);
    controller.dispose();
  });

  test("two forms share one script tag", () => {
    savedObserver = Object.getOwnPropertyDescriptor(window, "IntersectionObserver");
    useObserver(undefined);
    const first = createTurnstile(options());
    const second = createTurnstile(options());
    first.watch();
    second.watch();
    expect(scripts()).toEqual([SRC]);
    first.dispose();
    second.dispose();
  });
});
