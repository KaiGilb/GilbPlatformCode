// THE CONTROLLER of "Their online card / My card of them".
//
// Headless (no React): a small store the apps' one component draws, with the acts the holder can do. Every rule of the
// slice that is not a pixel lives here, once, for both apps:
//
//   * LAZY. Nothing is read until `load()` (the card was OPENED). A card open is ONE resolve + ONE card read. A list row
//     never calls this: its "connected" marker is derived from the link the list already read (`readLink`), no request.
//   * NO COPY ("We don't duplicate data. The source is the source."). The online card is shown live at the
//     viewer's rung and is never copied into a held claim; there is no "Use this" and no code that writes one.
//   * HOLDER ONLY. The only write is the link/unlink patch of the holder's own record (`linkWrite`/`unlinkWrite`). The
//     online card is never written, from here or anywhere.
//   * UNLINK CHANGES NOTHING ELSE. `unlink()` retracts the link and clears the online side. It deletes no claim, touches no
//     rung, and the local card is not re-read.
//   * A FAILURE IS NEVER "NONE". A card that could not be reached says so; "no online card" is only the platform's one
//     refusal answer.
import { findOnlineCardResult, type OnlineCardCandidate } from "./find";
import { linkWrite, unlinkWrite, type LinkWrite } from "./linkWrite";
import { readLink, type LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import { resolveOnlineCard, type ResolveOutcome } from "@kaigilb/gilbplatformcode-person-connections";
import { readOnlineCard, type OnlineCard, type OnlineCardRead } from "./publicCard";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

export type OnlineSide =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      card: OnlineCard;
      party: string;
    }
  /** Linked, but the platform answers its one refusal: not reachable by this holder now (removed, not a card, not allowed). */
  | { status: "none" }
  /** Linked to an organization's card: the organization slice draws it. */
  | { status: "organization" }
  | { status: "unauthenticated" }
  | { status: "unavailable" }
  /** The platform answered 429: the card may be asked for again at `retryAt` (epoch ms); "Try again" is disabled until then. */
  | { status: "busy"; retryAt: number };

export type FindSide =
  | { status: "closed" }
  /** The search box is open, name pre-filled from the local card; nothing has been asked yet. */
  | { status: "idle"; query: string }
  | { status: "searching"; query: string }
  | { status: "results"; query: string; candidates: OnlineCardCandidate[]; total: number; cutAt: number | null }
  | { status: "error"; query: string; message: string };

export interface OnlineCardState {
  link: LinkReading;
  online: OnlineSide;
  find: FindSide;
  /** The act in flight, or null. One at a time. */
  busy: null | { act: "link" | "unlink"; key?: string };
  /** The last act that failed, in words; cleared by the next act. */
  error: string | null;
}

/** The record the card is about, and the holder who is signed in. */
export interface CardSubject {
  /** The holder's own record: absolute entity address. */
  uri: string;
  holder: string;
  /** The record's link as its served facts carry it (re-read by the app after a write; the controller also tracks it). */
  link: LinkReading;
}

export interface ControllerDeps {
  /** The identity node (card, resolver, find) with the app's AUTHENTICATED fetch. */
  platform: PlatformClient;
  subject: CardSubject;
  /** May the holder write this record? (A reader sees the online card and cannot link or copy.) */
  canWrite: boolean;
  /**
   * An app whose card IS its connection (an app where a contact is a person's principal) knows the party without asking the resolver:
   * it supplies the answer. Default: the resolver (`resolveOnlineCard`, one request).
   */
  resolve?(): Promise<ResolveOutcome>;
  /**
   * An app that already read the card route for its own screen hands that read over, so a card open stays ONE card read.
   * Default: `readOnlineCard` (one request).
   */
  readCard?(principal: string): Promise<OnlineCardRead>;
  /** The app's merge patch of the holder's own record. Called with ONLY the link's patch. */
  writeLink(w: LinkWrite): Promise<void>;
  /** Milliseconds one request of the card may take before it ends as "could not be reached" (default {@link ONLINE_CARD_REQUEST_TIMEOUT_MS}). */
  requestTimeoutMs?: number;
  /** The record's link changed (after a write): the app refreshes its record cache so the list marker follows. */
  onLinkChanged?(link: LinkReading): void;
}

export interface OnlineCardController {
  getState(): OnlineCardState;
  subscribe(listener: () => void): () => void;
  /**
   * The card was opened: resolve + read the online card (if linked). A load already in flight is
   * shared (a StrictMode remount does not double the requests); `force` starts a new one (Try again, after a link).
   */
  load(force?: boolean): Promise<void>;
  openFind(prefill: string): void;
  closeFind(): void;
  search(name: string): Promise<void>;
  /** The holder confirmed THIS candidate. */
  confirmLink(candidate: Pick<OnlineCardCandidate, "principal">): Promise<void>;
  unlink(): Promise<void>;
  dispose(): void;
}

/** One request of the card (resolver, card read, find) ends as "could not be reached" after this long. */
export const ONLINE_CARD_REQUEST_TIMEOUT_MS = 10_000;
/** A 429's wait is kept inside these bounds (a missing or absurd `Retry-After` neither spins nor locks the card). */
export const MIN_BUSY_WAIT_MS = 1_000;
export const MAX_BUSY_WAIT_MS = 60_000;
/** The wait when the 429 names none, or the browser cannot read `Retry-After` (cross-origin, unless the platform exposes it). */
export const DEFAULT_BUSY_WAIT_MS = 5_000;

export const WORDS = {
  online: "Their online card",
  local: "My card of them",
  onlineHelp: "What they publish on their own vault, shown at the level that admits you. You cannot change it.",
  localHelp: "Your own record of them. Only you see it.",
  linkedMarker: "Connected",
  findTitle: "Find their online card",
  noGrant: "Connecting grants nobody anything, and they are not told.",
} as const;

export function createOnlineCardController(deps: ControllerDeps): OnlineCardController {
  let state: OnlineCardState = {
    link: deps.subject.link,
    online: { status: "idle" },
    find: { status: "closed" },
    busy: null,
    error: null,
  };
  const listeners = new Set<() => void>();
  let generation = 0;
  let disposed = false;
  let inflight: Promise<void> | null = null;
  const timeoutMs = deps.requestTimeoutMs ?? ONLINE_CARD_REQUEST_TIMEOUT_MS;
  /** Aborts the card's own requests (resolver, card read): replaced by each load, fired by dispose, unlink and a newer load. */
  let loadAc: AbortController | null = null;
  let findAc: AbortController | null = null;
  let busyTimer: ReturnType<typeof setTimeout> | null = null;
  const abortLoad = () => {
    loadAc?.abort();
    loadAc = null;
  };
  const abortFind = () => {
    findAc?.abort();
    findAc = null;
  };
  /** An app-supplied resolve/read also ends after the deadline (the default ones are bounded inside the request). */
  const deadline = <T,>(p: Promise<T>, signal: AbortSignal, otherwise: T): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => resolve(otherwise), timeoutMs);
      const stop = () => {
        clearTimeout(t);
        resolve(otherwise);
      };
      if (signal.aborted) return stop();
      signal.addEventListener("abort", stop, { once: true });
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  const busyFor = (ms: number | null): number => Math.min(MAX_BUSY_WAIT_MS, Math.max(MIN_BUSY_WAIT_MS, ms ?? DEFAULT_BUSY_WAIT_MS));
  const set = (patch: Partial<OnlineCardState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const l of [...listeners]) l();
  };

  async function loadOnline(gen: number): Promise<void> {
    if (state.link.state !== "linked") {
      set({ online: { status: "idle" } });
      return;
    }
    set({ online: { status: "loading" } });
    abortLoad();
    const ac = (loadAc = new AbortController());
    const bound = { signal: ac.signal, timeoutMs };
    const resolved = await (deps.resolve ? deadline(deps.resolve().catch((): ResolveOutcome => ({ kind: "unavailable", status: 0 })), ac.signal, { kind: "unavailable", status: 0 } as ResolveOutcome) : resolveOnlineCard(deps.platform, deps.subject.uri, bound));
    if (gen !== generation) return;
    if (resolved.kind === "busy") return goBusy(resolved.retryAfterMs);
    if (resolved.kind === "none") return set({ online: { status: "none" } });
    if (resolved.kind === "organization") return set({ online: { status: "organization" } });
    if (resolved.kind === "unauthenticated") return set({ online: { status: "unauthenticated" } });
    if (resolved.kind === "unavailable") return set({ online: { status: "unavailable" } });
    const read = await (deps.readCard ? deadline(deps.readCard(resolved.principal).catch((): OnlineCardRead => ({ kind: "unavailable", status: 0 })), ac.signal, { kind: "unavailable", status: 0 } as OnlineCardRead) : readOnlineCard(deps.platform, resolved.principal, bound));
    if (gen !== generation) return;
    if (read.kind === "busy") return goBusy(read.retryAfterMs);
    if (read.kind === "none") return set({ online: { status: "none" } });
    if (read.kind === "unavailable") return set({ online: { status: "unavailable" } });
    set({ online: { status: "ready", card: read.card, party: resolved.entity || resolved.principal } });
  }

  function goBusy(ms: number | null): void {
    const wait = busyFor(ms);
    const retryAt = Date.now() + wait;
    set({ online: { status: "busy", retryAt } });
    if (busyTimer) clearTimeout(busyTimer);
    busyTimer = setTimeout(() => {
      busyTimer = null;
      set({}); // tell the screen the wait is over so "Try again" is enabled
    }, wait);
  }

  const fail = (e: unknown): void => set({ busy: null, error: e instanceof Error ? e.message : String(e) });

  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load(force = false) {
      if (inflight && !force) return inflight;
      // While the platform asked for a wait, nothing is asked again before it is over (no tight loop, however often this is called).
      if (state.online.status === "busy" && Date.now() < state.online.retryAt) return Promise.resolve();
      abortLoad();
      const gen = ++generation;
      const run = loadOnline(gen);
      inflight = run;
      void run.finally(() => {
        if (inflight === run) inflight = null;
      });
      return run;
    },
    openFind(prefill) {
      if (!deps.canWrite || state.link.state === "linked") return;
      set({ find: { status: "idle", query: prefill }, error: null });
    },
    closeFind() {
      abortFind();
      set({ find: { status: "closed" } });
    },
    async search(name) {
      const q = name.trim();
      if (!q) return set({ find: { status: "idle", query: name } });
      abortFind();
      const fac = (findAc = new AbortController());
      set({ find: { status: "searching", query: q }, error: null });
      try {
        const { candidates, total } = await findOnlineCardResult(deps.platform, q, undefined, { signal: fac.signal, timeoutMs });
        if (state.find.status !== "searching" || state.find.query !== q) return;
        // A cut is shown: `cutAt` is how many are listed when the find named more people than that.
        set({ find: { status: "results", query: q, candidates, total: Math.max(total, candidates.length), cutAt: total > candidates.length ? candidates.length : null } });
      } catch (e) {
        if (state.find.status !== "searching" || state.find.query !== q) return;
        set({ find: { status: "error", query: q, message: e instanceof Error ? e.message : String(e) } });
      }
    },
    async confirmLink(candidate) {
      if (!deps.canWrite || state.busy) return;
      set({ busy: { act: "link" }, error: null });
      try {
        const w = linkWrite({ record: deps.subject.uri, target: candidate.principal });
        await deps.writeLink(w);
        const link: LinkReading = { state: "linked", target: candidate.principal };
        set({ link, busy: null, find: { status: "closed" } });
        deps.onLinkChanged?.(link);
      } catch (e) {
        return fail(e);
      }
      await this.load(true);
    },
    async unlink() {
      if (!deps.canWrite || state.busy) return;
      set({ busy: { act: "unlink" }, error: null });
      try {
        await deps.writeLink(unlinkWrite({ record: deps.subject.uri }));
        generation++; // a read still in flight is dropped
        abortLoad();
        const link: LinkReading = { state: "none" };
        // Only the link and the online side change.
        set({ link, online: { status: "idle" }, busy: null });
        deps.onLinkChanged?.(link);
      } catch (e) {
        fail(e);
      }
    },
    dispose() {
      disposed = true;
      generation++;
      abortLoad();
      abortFind();
      if (busyTimer) clearTimeout(busyTimer);
      listeners.clear();
    },
  };
}

/** The list-row marker: "connected" iff the link the list already read is one reference. ⛔ No request. */
export function isConnected(served: Readonly<Record<string, unknown>> | null | undefined): boolean {
  return readLink(served).state === "linked";
}
