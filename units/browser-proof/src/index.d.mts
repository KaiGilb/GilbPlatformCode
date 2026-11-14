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
  /** Prints the message, then waits until the expression is truthy (default five minutes). */
  waitForHuman(message: string, readyExpr: string, timeoutMs?: number): Promise<any>;
  sleep(ms: number): Promise<void>;
}

export function makePage(cdp: Pick<CdpClient, "send" | "errors">, options?: { log?: (line: string) => void }): Page;

export interface StartBrowserOptions {
  chrome?: string;
  /** Open a visible window instead of headless Chrome. */
  headed?: boolean;
  /** Use `profileDir` itself as the profile and leave it when closed, so a sign-in survives to the next run. */
  keepProfile?: boolean;
  /** A folder to make the throwaway profile in (default `.browser-proof` under the current folder); with `keepProfile`, the profile itself (default `.browser-proof/profile`). */
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

export function buildChromeArgs(options: { headed?: boolean; args?: string[] } | undefined, profile: string): string[];

/** What the button-row check needs from a page. */
export interface EvalPage {
  eval(expression: string): Promise<any>;
}
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
export interface RowButton {
  label: string;
  rect: Rect;
  isRed: boolean;
  isDefault: boolean;
}
export interface ButtonRow {
  /** A short CSS path to the row. */
  path: string;
  /** The row's content box (inside its padding and border). */
  rect: Rect;
  buttons: RowButton[];
}
export type ButtonRule = "not-right-aligned" | "negative-right-of-positive" | "positive-not-rightmost" | "danger-not-far-left" | "confirm-order" | "stretched";
export interface ButtonRowViolation {
  path: string;
  rule: ButtonRule;
  message: string;
}
export function collectButtonRows(page: EvalPage, options?: { selectors?: string[] }): Promise<ButtonRow[]>;
export function classifyButton(button: Pick<RowButton, "label" | "isRed">): "negative" | "danger" | "positive";
export function judgeButtonRows(rows: readonly ButtonRow[], options: { viewportWidth: number }): ButtonRowViolation[];
export function assertButtonRows(page: EvalPage, options?: { selectors?: string[]; viewportWidth?: number }): Promise<number>;

export interface ToolsPage {
  eval(expression: string): Promise<any>;
  waitFor(fnText: string, timeoutMs?: number): Promise<any>;
  send(method: string, params?: Record<string, unknown>): Promise<any>;
}
export interface Tools {
  byTestId(id: string): string;
  exists(selector: string): Promise<boolean>;
  wait(selector: string, timeoutMs?: number): Promise<unknown>;
  gone(selector: string, timeoutMs?: number): Promise<unknown>;
  click(selector: string, timeoutMs?: number): Promise<void>;
  clickText(text: string, options?: { within?: string; timeoutMs?: number; selector?: string }): Promise<void>;
  set(selector: string, value: string | number, timeoutMs?: number): Promise<void>;
  waitImage(selector: string, timeoutMs?: number): Promise<unknown>;
  setFiles(selector: string, paths: string | string[]): Promise<void>;
  noHorizontalScroll(width?: number): Promise<void>;
}
export function byTestId(id: string): string;
export function makeTools(page: ToolsPage): Tools;
