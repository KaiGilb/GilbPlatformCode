/**
 * Loads Cloudflare Turnstile late, and only for a form that has a site key.
 * The script is injected when the form comes within one viewport (`rootMargin` `100% 0px`)
 * or when a field takes focus, whichever is first. With no IntersectionObserver it loads
 * as soon as `watch` runs (mount). The widget is drawn with explicit `render` after the script loads.
 * A send calls `waitForToken` and gives up after `tokenWaitMs`.
 */

/** How often a waiting send looks for the token. */
export const TURNSTILE_POLL_MS = 100;

/** Explicit render: the script must not draw a widget by itself before `render` runs. */
export const DEFAULT_TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** One viewport above and below the form. Two values: vertical, then horizontal. */
const NEAR_MARGIN = "100% 0px";

interface TurnstileApi {
  render: (el: HTMLElement, options: { sitekey: string }) => string;
  getResponse: (widgetId: string) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

export interface TurnstileOptions {
  /** Empty: `watch` and `notifyFocus` do nothing and no script is added. */
  siteKey: string;
  scriptUrl: string;
  /** The form. Observed for nearness; focus inside it is reported with `notifyFocus`. */
  form: HTMLElement;
  /** Where `render` draws the widget. */
  box: HTMLElement;
  tokenWaitMs: number;
  pollMs?: number;
}

export interface TurnstileController {
  /** Call once from mount. */
  watch(): void;
  /** A field (or anything inside the form) took focus. */
  notifyFocus(): void;
  /** Resolves with the widget's token, or rejects when none arrives in time. */
  waitForToken(): Promise<string>;
  /** Asks the widget for a fresh token. A token works once. */
  reset(): void;
  /** Stops watching and removes the widget. */
  dispose(): void;
}

function readApi(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

function findScript(src: string): HTMLScriptElement | undefined {
  const scripts = document.getElementsByTagName("script");
  for (const script of scripts) {
    if (script.getAttribute("src") === src || script.src === src) return script;
  }
  return undefined;
}

function loadScript(src: string): Promise<void> {
  if (readApi()) return Promise.resolve();
  const existing = findScript(src);
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        script.remove();
        reject(new Error("Turnstile script failed to load"));
      },
      { once: true },
    );
    if (!existing) {
      script.async = true;
      script.src = src;
      document.head.appendChild(script);
    }
  });
}

/**
 * One form's Turnstile widget. Two forms on a page share the script tag and each call `render`.
 */
export function createTurnstile(options: TurnstileOptions): TurnstileController {
  const pollMs = options.pollMs ?? TURNSTILE_POLL_MS;
  let widgetId: string | undefined;
  let started: Promise<void> | null = null;
  let observer: IntersectionObserver | undefined;
  let disposed = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let resolvePoll: (() => void) | undefined;

  function stopWatching(): void {
    observer?.disconnect();
    observer = undefined;
  }

  function start(): Promise<void> {
    if (!options.siteKey) return Promise.resolve();
    if (started) return started;
    stopWatching();
    const run = loadScript(options.scriptUrl).then(() => {
      if (disposed) return;
      const api = readApi();
      if (!api) throw new Error("Turnstile unavailable");
      if (widgetId === undefined) widgetId = api.render(options.box, { sitekey: options.siteKey });
    });
    started = run;
    run.catch(() => {
      if (started === run) started = null;
    });
    return run;
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      resolvePoll = resolve;
      pollTimer = setTimeout(() => {
        pollTimer = undefined;
        resolvePoll = undefined;
        resolve();
      }, ms);
    });
  }

  return {
    watch(): void {
      if (!options.siteKey || disposed) return;
      if (typeof IntersectionObserver !== "function") {
        void start().catch(() => {});
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void start().catch(() => {});
        },
        { rootMargin: NEAR_MARGIN },
      );
      observer.observe(options.form);
    },
    notifyFocus(): void {
      if (!options.siteKey || started || disposed) return;
      void start().catch(() => {});
    },
    async waitForToken(): Promise<string> {
      if (!options.siteKey) throw new Error("no Turnstile token in time");
      const deadline = Date.now() + options.tokenWaitMs;
      let failed = false;
      void start().catch(() => {
        failed = true;
      });
      for (;;) {
        if (disposed) throw new Error("no Turnstile token in time");
        const token = widgetId !== undefined ? readApi()?.getResponse(widgetId) : undefined;
        if (token) return token;
        if (failed || Date.now() >= deadline) throw new Error("no Turnstile token in time");
        await delay(pollMs);
      }
    },
    reset(): void {
      if (widgetId === undefined) return;
      try {
        readApi()?.reset(widgetId);
      } catch {
        /* the widget is not drawn yet */
      }
    },
    dispose(): void {
      disposed = true;
      if (pollTimer !== undefined) clearTimeout(pollTimer);
      pollTimer = undefined;
      resolvePoll?.();
      resolvePoll = undefined;
      stopWatching();
      if (widgetId !== undefined) {
        try {
          readApi()?.remove(widgetId);
        } catch {
          /* already gone */
        }
        widgetId = undefined;
      }
    },
  };
}
