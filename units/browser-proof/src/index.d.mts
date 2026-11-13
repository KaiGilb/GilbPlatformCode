export function findChrome(env?: Record<string, string | undefined>, exists?: (path: string) => boolean, platform?: string): string | null;

export interface WebSocketLike {
  onopen: (() => void) | null;
  onerror: ((e?: unknown) => void) | null;
  onclose: (() => void) | null;
  onmessage: ((m: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export class CdpClient {
  constructor(url: string, options?: { WebSocketImpl?: new (url: string) => WebSocketLike });
  readonly ready: Promise<void>;
  readonly errors: string[];
  on(method: string, fn: (params: any) => void): () => void;
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  close(): void;
}

export interface Page {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  eval(expression: string): Promise<any>;
  waitFor(fnText: string, timeoutMs?: number): Promise<any>;
  goto(url: string, options?: { ready?: string; timeoutMs?: number }): Promise<void>;
  screenshot(file: string): Promise<string>;
  consoleErrors(): string[];
  setViewport(v: { width: number; height: number; deviceScaleFactor?: number; mobile?: boolean }): Promise<unknown>;
  key(k: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export function makePage(cdp: Pick<CdpClient, "send" | "errors">): Page;

export interface StartBrowserOptions {
  chrome?: string;
  /** A folder to make the throwaway profile in. Default `.browser-proof` under the current folder. */
  profileDir?: string;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
  /** Protocol domains to enable. Default Runtime, Page and Log. */
  domains?: string[];
  args?: string[];
  startupMs?: number;
}
export function startBrowser(options?: StartBrowserOptions): Promise<{ page: Page; close(): Promise<void>; chrome: string; profile: string }>;

export type Leg = [name: string, run: (page: Page) => unknown] | { name: string; run: (page: Page) => unknown };
export interface LegResult {
  n: number;
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
}
export function runLegs(
  legs: readonly Leg[],
  options: {
    page: Pick<Page, "consoleErrors"> & Partial<Pick<Page, "screenshot">>;
    out?: string;
    log?: (line: string) => void;
    setExitCode?: boolean;
    describeFailure?: (page: any) => Promise<string | null> | string | null;
  },
): Promise<{ results: LegResult[]; failed: LegResult[] }>;
