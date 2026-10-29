import { registerCache } from "@kaigilb/gilbplatformcode-principal-hub";
// The background-jobs store. A closure made by createBackgroundJobs (no React here), so a job outlives the page that started it and every navigation.
// A slow action takes its time in the browser; the page no longer waits for it: it enqueues a job and goes back to the list at once.
//  - ONE flight per key (the host builds it, for example `${vault}|${kind}|${subject}`): a second enqueue while that job is queued or running returns the running job, and runs nothing.
//  - Jobs of ONE workspace run one after another (FIFO), so two writes never race each other. Other workspaces run on their own lane.
//  - SNAPSHOT GUARD: the job carries what the person saw at the click. When it STARTS it asks `recheck` (a fresh read); a reason back means it refuses, writes nothing and leaves a notice.
//  - NEVER RETRIED, NEVER RE-RUN: `run` is called at most once per job. A reload loses the job; what is left is an intent record in the storage, shown as "did not finish", and never run again.
//  - While any job is queued or running the browser asks before the tab is closed.

/** A host-defined name for the sort of job. The host lists the ones it uses in `kinds`. */
export type JobKind = string;
export type JobState = "queued" | "running" | "done" | "failed";
/** `quiet`: a failure that is no news (the job was cancelled by a further edit): no notice. `data`: what a finished job hands to the page that waits for it. */
export type JobResult = { ok: boolean; message: string; quiet?: boolean; data?: unknown };
/** What a running job is told, and may use: `cancelled` turns true when the subject was edited again (cancelJobs); `exclusive` runs a part in the workspace's one lane (after the waiting, the writes). */
export interface JobSignal { cancelled: boolean; exclusive<T>(fn: () => Promise<T>): Promise<T> }
export interface Job { key: string; kind: JobKind; draftId: string; workspace: string; label: string; state: JobState; message: string; at: number; /** other ids the job concerns */ refs?: string[]; data?: unknown }
export interface Notice { key: string; kind: JobKind; draftId: string; workspace: string; text: string; at: number }
/** A finished, successful job: the short toast the list shows. */
export interface Toast { key: string; kind: JobKind; draftId: string; workspace: string; text: string; at: number }
/** An intent a reload cut off. */
export interface Unfinished { key: string; kind: JobKind; draftId: string; workspace: string; label: string; snapshot: string; at: number; text: string }
export interface EnqueueArgs {
  key: string; kind: JobKind; draftId: string; workspace: string; label: string;
  /** The hash of the text shown at the click (kept in the intent record). */
  snapshot?: string;
  /** Fresh re-read when the job starts: a plain reason when what was shown no longer holds, else null. */
  recheck?: () => Promise<string | null>;
  /** Not in the workspace lane (it waits on the world, not on the vault): it takes the lane itself, for its writes, through `signal.exclusive`. */
  free?: boolean;
  refs?: string[];
  run: (signal: JobSignal) => Promise<JobResult>;
}

export interface BackgroundJobsOptions {
  /** The storage key under which the intent records are kept. Required: the host names its own. */
  storageKey: string;
  /** Every kind that enqueue records; the intent reader accepts only these. */
  kinds: readonly JobKind[];
  /** The notice text for a failed job. */
  failText: (kind: JobKind, message: string) => string;
  /** The "did not finish" line for an intent a reload cut off. */
  unfinishedText: (label: string, kind?: JobKind) => string;
  /** The message of a job that was cancelled before it started. */
  cancelledText: string;
  /** The message of a job whose run or recheck threw. */
  crashText: string;
  /** Kinds whose success leaves no toast (the page says its own outcome). Default: none. */
  quietSuccessKinds?: readonly JobKind[];
  /** Finished jobs kept in memory (default 40). */
  keepFinished?: number;
  /** The storage that holds the intent records (default: sessionStorage, or none when the browser has none). */
  storage?: () => Storage | null;
  /** The names under which the store and its intent records register with the principal hub (default "backgroundJobs" and "backgroundJobIntents"). */
  cacheNames?: { views?: string; intents?: string };
}

export interface BackgroundJobs {
  jobKey(vault: string, kind: JobKind, draftId: string): string;
  setJobPrincipal(principal: string): void;
  cancelJobs(workspace: string, draftId: string, kinds: readonly JobKind[]): number;
  enqueue(args: EnqueueArgs): Job;
  subscribe(l: () => void): () => void;
  onFinished(l: (j: Job) => void): () => void;
  isPending(key: string): boolean;
  jobsIdle(): Promise<void>;
  anyActive(): boolean;
  getVersion(): number;
  jobsOf(workspace: string): Job[];
  activeJobOf(workspace: string, draftId: string): Job | undefined;
  noticesOf(workspace: string): Notice[];
  toastsOf(workspace: string): Toast[];
  unfinishedOf(workspace: string): Unfinished[];
  dismiss(workspace: string, key: string): void;
  clearDraft(workspace: string, draftId: string): void;
  forgetPersonViews(): void;
  __resetForTests(o?: { reload?: boolean }): void;
}

interface Entry { job: Job; args: EnqueueArgs; signal: JobSignal; section?: { fn: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void } }
type Intent = { key: string; kind: JobKind; draftId: string; workspace: string; label: string; snapshot: string; at: number; /** whose action it was; another person signing in in this tab never sees it */ principal?: string };

export function createBackgroundJobs(options: BackgroundJobsOptions): BackgroundJobs {
  const INTENTS = options.storageKey;
  const KEEP_FINISHED = options.keepFinished ?? 40;
  const KINDS: readonly string[] = options.kinds;
  const quietSuccess: readonly string[] = options.quietSuccessKinds ?? [];
  const { failText, unfinishedText } = options;

  let entries = new Map<string, Entry>();
  let notices: Notice[] = [];
  let toasts: Toast[] = [];
  let unfinished: Unfinished[] = [];
  let lanes = new Map<string, Entry[]>();
  let laneBusy = new Set<string>();
  let version = 0;
  /** The signed-in person (null until the app says). Intents are stamped with it; a change of person clears every intent and "did not finish" line. */
  let principalNow: string | null = null;
  let generation = 0; // bumped by a test "reload": a job of the generation before ends silently (a real reload kills it)
  const listeners = new Set<() => void>();
  const finishedListeners = new Set<(j: Job) => void>();
  const emit = () => { version++; for (const l of [...listeners]) l(); };

  const jobKey = (vault: string, kind: JobKind, draftId: string) => `${vault}|${kind}|${draftId}`;

  function setJobPrincipal(principal: string): void {
    if (principalNow === principal) return;
    const first = principalNow === null;
    principalNow = principal;
    // The first call is the sign-in of this tab: what the same person's earlier page load left stays; what another person left goes. A later change of person clears everything.
    writeIntents(first ? readIntents().filter((i) => i.principal === principal) : []);
    if (!first) { notices = []; toasts = []; }
    loadUnfinished(); emit();
  }

  const store = (): Storage | null => {
    if (options.storage) { try { return options.storage(); } catch { return null; } }
    try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
  };
  const readIntents = (): Intent[] => {
    try {
      const v = JSON.parse(store()?.getItem(INTENTS) ?? "[]");
      return Array.isArray(v) ? v.filter((i): i is Intent => !!i && typeof i.key === "string" && typeof i.draftId === "string" && typeof i.workspace === "string" && KINDS.includes(i.kind)).map((i) => ({ ...i, label: String(i.label ?? ""), snapshot: String(i.snapshot ?? ""), at: Number(i.at) || 0 })) : [];
    } catch { return []; }
  };
  const writeIntents = (list: Intent[]) => { try { if (list.length) store()?.setItem(INTENTS, JSON.stringify(list)); else store()?.removeItem(INTENTS); } catch { /* storage full or off: the guard is best effort */ } };
  const addIntent = (i: Intent) => writeIntents([...readIntents().filter((x) => x.key !== i.key), i]);
  const dropIntent = (key: string) => writeIntents(readIntents().filter((x) => x.key !== key));
  /** What is left in the storage when this page was loaded is, by definition, an action a reload cut off. It is shown, never run. */
  function loadUnfinished() {
    unfinished = readIntents().filter((i) => principalNow === null || i.principal === principalNow).map((i) => ({ ...i, text: unfinishedText(i.label, i.kind) }));
  }

  // The browser's "leave this page?" prompt, only while something is queued or running.
  const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; return ""; };
  let guarding = false;
  const active = () => [...entries.values()].some((e) => e.job.state === "queued" || e.job.state === "running");
  function syncGuard() {
    if (typeof window === "undefined") return;
    const want = active();
    if (want && !guarding) { window.addEventListener("beforeunload", guard); guarding = true; }
    else if (!want && guarding) { window.removeEventListener("beforeunload", guard); guarding = false; }
  }

  function set(e: Entry, patch: Partial<Job>) { e.job = { ...e.job, ...patch }; emit(); }
  function prune() {
    const done = [...entries.values()].filter((e) => e.job.state === "done" || e.job.state === "failed");
    for (const e of done.slice(0, Math.max(0, done.length - KEEP_FINISHED))) entries.delete(e.job.key);
  }

  async function runOne(e: Entry): Promise<void> {
    const gen = generation;
    set(e, { state: "running" });
    syncGuard();
    let r: JobResult;
    try {
      const refused = e.signal.cancelled ? null : e.args.recheck ? await e.args.recheck() : null;
      r = e.signal.cancelled ? { ok: false, quiet: true, message: options.cancelledText } : refused ? { ok: false, message: refused } : await e.args.run(e.signal); // run is called once: never retried
    } catch { r = { ok: false, message: options.crashText }; }
    if (gen !== generation) return;
    const now = Date.now();
    dropIntent(e.job.key);
    if (quietSuccess.includes(e.job.kind) && r.ok) set(e, { state: "done", message: r.message }); // the page said its own outcome
    else if (r.ok) {
      toasts = [...toasts.filter((t) => t.key !== e.job.key), { key: e.job.key, kind: e.job.kind, draftId: e.job.draftId, workspace: e.job.workspace, text: r.message, at: now }];
      set(e, { state: "done", message: r.message, ...(r.data !== undefined ? { data: r.data } : {}) });
    } else {
      if (!r.quiet) notices = [...notices.filter((n) => n.key !== e.job.key), { key: e.job.key, kind: e.job.kind, draftId: e.job.draftId, workspace: e.job.workspace, text: failText(e.job.kind, r.message), at: now }];
      set(e, { state: "failed", message: r.message });
    }
    prune();
    syncGuard();
    for (const l of [...finishedListeners]) { try { l(e.job); } catch { /* a listener must not stop the lane */ } }
  }

  function pump(workspace: string) {
    if (laneBusy.has(workspace)) return;
    const lane = lanes.get(workspace);
    const next = lane?.shift();
    if (!next) { lanes.delete(workspace); return; }
    laneBusy.add(workspace);
    const gen = generation;
    const sec = next.section;
    const running = sec ? sec.fn().then(sec.resolve, sec.reject) : runOne(next);
    void running.finally(() => { if (gen !== generation) return; laneBusy.delete(workspace); pump(workspace); });
  }

  /** One part of a job, in the workspace's lane: behind the jobs already there, and ahead of those that come after. */
  function exclusive<T>(workspace: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const section: Entry = { job: { key: "", kind: "", draftId: "", workspace, label: "", state: "running", message: "", at: Date.now() }, args: { key: "", kind: "", draftId: "", workspace, label: "", run: async () => ({ ok: true, message: "" }) }, signal: { cancelled: false, exclusive: () => Promise.reject(new Error("no nesting")) }, section: { fn, resolve: resolve as (v: unknown) => void, reject } };
      const lane = lanes.get(workspace) ?? [];
      lane.push(section); lanes.set(workspace, lane);
      pump(workspace);
    });
  }

  /** The subject was edited again: the jobs of the given kinds that wait (or are queued) stop, quietly. A job already past its waiting writes as it was told: its snapshot guard refuses it if the text changed. */
  function cancelJobs(workspace: string, draftId: string, kinds: readonly JobKind[]): number {
    let n = 0;
    for (const e of entries.values()) if (e.job.workspace === workspace && e.job.draftId === draftId && kinds.includes(e.job.kind) && (e.job.state === "queued" || e.job.state === "running") && !e.signal.cancelled) { e.signal.cancelled = true; n++; }
    return n;
  }

  /** Queue a job. A job with the same key that is still queued or running is returned instead (nothing new runs). The subject's old notice and "did not finish" line go: it is being acted on. */
  function enqueue(args: EnqueueArgs): Job {
    const live = entries.get(args.key);
    if (live && (live.job.state === "queued" || live.job.state === "running")) return live.job;
    notices = notices.filter((n) => !(n.workspace === args.workspace && n.draftId === args.draftId));
    toasts = toasts.filter((t) => !(t.workspace === args.workspace && t.draftId === args.draftId));
    unfinished = unfinished.filter((u) => !(u.workspace === args.workspace && u.draftId === args.draftId));
    const job: Job = { key: args.key, kind: args.kind, draftId: args.draftId, workspace: args.workspace, label: args.label, state: "queued", message: "", at: Date.now() };
    const entry: Entry = { job: { ...job, ...(args.refs ? { refs: args.refs } : {}) }, args, signal: { cancelled: false, exclusive: (fn) => exclusive(args.workspace, fn) } };
    entries.delete(args.key); entries.set(args.key, entry);
    addIntent({ key: args.key, kind: args.kind, draftId: args.draftId, workspace: args.workspace, label: args.label, snapshot: args.snapshot ?? "", at: job.at, ...(principalNow !== null ? { principal: principalNow } : {}) });
    if (args.free) { syncGuard(); emit(); void runOne(entry).catch(() => undefined); return entry.job; } // (state "running" from its first line: it is waiting on the world, not queued behind a write)
    const lane = lanes.get(args.workspace) ?? [];
    lane.push(entry); lanes.set(args.workspace, lane);
    syncGuard();
    emit();
    pump(args.workspace);
    return entry.job;
  }

  const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  /** Called once for every job that ends (done or failed), whichever page is on screen. */
  const onFinished = (l: (j: Job) => void): (() => void) => { finishedListeners.add(l); return () => { finishedListeners.delete(l); }; };
  /** Whether a job of this key is queued or running. */
  const isPending = (key: string): boolean => { const e = entries.get(key); return !!e && (e.job.state === "queued" || e.job.state === "running"); };
  /** Resolves when no job is queued or running (a test waits on this). */
  const jobsIdle = async (): Promise<void> => { while (active()) await new Promise((r) => setTimeout(r, 0)); };
  const jobsOf = (workspace: string): Job[] => [...entries.values()].map((e) => e.job).filter((j) => j.workspace === workspace);
  const activeJobOf = (workspace: string, draftId: string): Job | undefined => jobsOf(workspace).find((j) => j.draftId === draftId && (j.state === "queued" || j.state === "running"));
  const noticesOf = (workspace: string): Notice[] => notices.filter((n) => n.workspace === workspace);
  const toastsOf = (workspace: string): Toast[] => toasts.filter((t) => t.workspace === workspace);
  const unfinishedOf = (workspace: string): Unfinished[] => unfinished.filter((u) => u.workspace === workspace);
  /** The notice, toast or "did not finish" line for this key is read and gone. */
  function dismiss(workspace: string, key: string) {
    notices = notices.filter((n) => !(n.workspace === workspace && n.key === key));
    toasts = toasts.filter((t) => !(t.workspace === workspace && t.key === key));
    const u = unfinished.filter((x) => x.workspace === workspace && x.key === key);
    if (u.length) { unfinished = unfinished.filter((x) => !u.includes(x)); dropIntent(key); }
    emit();
  }
  /** The subject was acted on some other way: its notices go. */
  function clearDraft(workspace: string, draftId: string) {
    const had = notices.length + toasts.length + unfinished.length;
    notices = notices.filter((n) => !(n.workspace === workspace && n.draftId === draftId));
    toasts = toasts.filter((t) => !(t.workspace === workspace && t.draftId === draftId));
    for (const u of unfinished.filter((x) => x.workspace === workspace && x.draftId === draftId)) dropIntent(u.key);
    unfinished = unfinished.filter((u) => !(u.workspace === workspace && u.draftId === draftId));
    if (had !== notices.length + toasts.length + unfinished.length) emit();
  }

  /**
   * The person changed (or signed out): what this tab showed of their jobs (the job rows, notices, toasts, "did not finish" lines) is forgotten. A job of theirs still running ends silently (the generation moves on),
   * so its notice never reaches the next person; its write finishes. The intents in the storage are stamped with the person and are handled by setJobPrincipal.
   */
  function forgetPersonViews(): void {
    generation++;
    entries = new Map(); notices = []; toasts = []; unfinished = [];
    syncGuard();
    emit();
  }
  registerCache(options.cacheNames?.views ?? "backgroundJobs", forgetPersonViews);
  // The intent records are stamped with the person; at a sign-out or a swap every intent that is not the next person's goes at once (not only at the next setJobPrincipal).
  registerCache(options.cacheNames?.intents ?? "backgroundJobIntents", (next) => { try { writeIntents(next === null ? [] : readIntents().filter((i) => i.principal === next)); } catch { /* storage refused */ } });

  /** Tests: forget everything in memory. `reload: true` keeps the storage and reads it back, as a page reload does (running jobs are lost, their intent records are what remains). */
  function __resetForTests(o: { reload?: boolean } = {}) {
    generation++;
    entries = new Map(); notices = []; toasts = []; unfinished = []; lanes = new Map(); laneBusy = new Set();
    if (!o.reload) { try { store()?.removeItem(INTENTS); } catch { /* ignore */ } }
    syncGuard();
    if (o.reload) loadUnfinished();
    emit();
  }
  loadUnfinished();

  return {
    jobKey, setJobPrincipal, cancelJobs, enqueue, subscribe, onFinished, isPending, jobsIdle, anyActive: () => active(), getVersion: () => version,
    jobsOf, activeJobOf, noticesOf, toastsOf, unfinishedOf, dismiss, clearDraft, forgetPersonViews, __resetForTests,
  };
}
