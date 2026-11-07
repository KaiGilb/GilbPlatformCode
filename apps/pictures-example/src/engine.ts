import { makePictureSet } from "@kaigilb/gilbplatformcode-picture-shrink";
import { pictureFailure } from "@kaigilb/gilbplatformcode-picture-errors";
import {
  buildCopyMap,
  linkFullLater,
  onCellular,
  uploadWithThumb,
  type PictureCopy,
  type ProgressSink,
  type UploadProgress,
} from "@kaigilb/gilbplatformcode-picture-set";
import type { UploadTarget } from "@kaigilb/gilbplatformcode-picture-upload";
import {
  NoAccessError,
  VaultBusyError,
  readRefusal,
  type RefusalDetail,
} from "@kaigilb/gilbplatformcode-refusal-detail";
import { NotSignedInError, dpopReadAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { RecordConflictError } from "@kaigilb/gilbplatformcode-lws-records";
import { entityIdTail } from "@kaigilb/gilbplatformcode-photo-ref";
import {
  afterFailure,
  busyDelayMs,
  classifyWith,
  dropOp,
  listOpsFor,
  newOpId,
  opStatus,
  progressOf,
  resetForRetry,
  saveOp,
  stampOp,
  stopsFlush,
  type FailureTests,
  type PendingOp,
} from "@kaigilb/gilbplatformcode-save-queue";
import { PICTURE_FOLDER } from "./setup";
import type { EngineState, PrepareNote, Session, Tile } from "./types";

/** A queued picture: the units' PendingOp, plus the full copy and the app's own marks. */
export type PictureOp = PendingOp & {
  fullBlob?: Blob;
  fullEntity?: string;
  masterLinked?: boolean;
  thumbRelinked?: boolean;
};

const TESTS: FailureTests = {
  refusedForGood: (e) => e instanceof NoAccessError || e instanceof RecordConflictError,
  busy: (e) => e instanceof VaultBusyError,
  notSignedIn: (e) => e instanceof NotSignedInError,
};

export interface EngineDeps {
  /** Tests replace the shrinker (jsdom has no canvas). */
  makeSet?: typeof makePictureSet;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

const EMPTY: EngineState = { tiles: [], notes: [], refusal: null, loaded: false };

export class PictureEngine {
  readonly session: Session;
  private state: EngineState = EMPTY;
  private listeners = new Set<() => void>();
  private ops = new Map<string, PictureOp>();
  private sending = new Set<string>();
  private previews = new Map<string, string>(); // op id -> local thumbnail URL
  private savedPreview = new Map<string, string>(); // stored address -> local thumbnail URL
  private stored: Tile[] = [];
  private flushing = false;
  private disposed = false;
  private readonly deps: Required<EngineDeps>;

  constructor(session: Session, deps: EngineDeps = {}) {
    this.session = session;
    this.deps = {
      makeSet: deps.makeSet ?? makePictureSet,
      setTimer: deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
    };
  }

  // ---- store for React ----------------------------------------------------
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): EngineState => this.state;

  private target(): UploadTarget {
    return { vaultOrigin: this.session.vaultOrigin, vaultRoot: this.session.vaultRoot, folder: PICTURE_FOLDER };
  }

  private publish(partial: Partial<EngineState> = {}): void {
    if (this.disposed) return;
    const queued: Tile[] = [...this.ops.values()]
      .filter((op) => !waitsForWifi(op))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((op) => this.tileOfOp(op));
    const tiles = [...queued, ...this.stored];
    this.state = { ...this.state, ...partial, tiles };
    for (const fn of [...this.listeners]) fn();
  }

  private tileOfOp(op: PictureOp): Tile {
    const st = opStatus(op, this.sending.has(op.id));
    const status = st === "stuck" ? "stuck" : st === "saving" ? "saving" : "waiting";
    const failure = status === "stuck" ? pictureFailure(new Error(op.stuckSentence ?? "")) : null;
    return {
      key: op.id,
      status,
      previewUrl: this.previews.get(op.id) ?? null,
      fileUri: op.thumbEntity ?? op.masterEntity ?? null,
      copies: [],
      name: String(op.change.name ?? "picture"),
      sentence: op.stuckSentence ?? op.busySentence ?? null,
      failure,
    };
  }

  // ---- start-up -----------------------------------------------------------
  /** Read the queue and the vault, then send what waits. */
  async start(): Promise<void> {
    this.disposed = false; // React StrictMode runs effect, cleanup, effect again on the same engine
    for (const op of (await listOpsFor(this.session.principal)) as PictureOp[]) {
      this.ops.set(op.id, op);
      const thumb = op.thumbBlob;
      if (thumb && !this.previews.has(op.id)) this.previews.set(op.id, URL.createObjectURL(thumb));
    }
    this.publish();
    await this.loadStored();
    void this.flush();
  }

  /** Stop publishing (an effect cleanup). The engine can be started again. */
  dispose(): void {
    this.disposed = true;
  }

  /** Sign-out: let go of the local thumbnails too. */
  release(): void {
    this.disposed = true;
    this.listeners.clear();
    for (const u of this.previews.values()) URL.revokeObjectURL(u);
    for (const u of this.savedPreview.values()) URL.revokeObjectURL(u);
  }

  async loadStored(): Promise<void> {
    const { vaultOrigin, vaultRoot } = this.session;
    const url = `${vaultOrigin}/lws/vault/${encodeURIComponent(vaultRoot)}/files`;
    try {
      const res = await fetch(url, { method: "GET", headers: await dpopReadAuth("GET", url), credentials: "omit" });
      if (res.status === 403) {
        const detail: RefusalDetail = await readRefusal("GET", url, res);
        this.publish({ refusal: { detail }, loaded: true });
        return;
      }
      if (!res.ok) throw new Error(`The pictures could not be read (HTTP ${res.status}).`);
      const json = (await res.json()) as { files?: { entity: string; body: Record<string, unknown> }[] };
      const files = (json.files ?? []).map((f) => ({ entityUri: f.entity, body: f.body }));
      const map = buildCopyMap(files as Parameters<typeof buildCopyMap>[0]);
      const seen = new Set<PictureCopy[]>();
      const tiles: Tile[] = [];
      for (const f of files) {
        const copies = map.get(entityIdTail(f.entityUri));
        if (!copies || copies.length === 0 || seen.has(copies)) continue;
        seen.add(copies);
        const thumb = copies[0]!;
        const queuedOp = [...this.ops.values()].find((op) => copies.some((c) => c.uri === op.masterEntity || c.uri === op.thumbEntity));
        if (queuedOp && !waitsForWifi(queuedOp)) continue;
        const preview = copies.map((c) => this.savedPreview.get(c.uri)).find(Boolean) ?? null;
        tiles.push({ key: thumb.uri, status: queuedOp ? "wifi" : "stored", previewUrl: preview, fileUri: thumb.uri, copies, name: "picture", sentence: null, failure: null });
      }
      this.stored = tiles;
      this.publish({ loaded: true });
    } catch (e) {
      this.stored = [];
      this.publish({ loaded: true, notes: [...this.state.notes, { key: newOpId(), name: "the pictures", failure: pictureFailure(e) }] });
    }
  }

  // ---- adding -------------------------------------------------------------
  /** Prepare each picture, show it at once, queue it, then send. */
  async add(files: File[]): Promise<void> {
    for (const file of files) {
      let set;
      try {
        set = await this.deps.makeSet(file, { type: "auto" });
      } catch (e) {
        const note: PrepareNote = { key: newOpId(), name: file.name, failure: pictureFailure(e) };
        this.publish({ notes: [...this.state.notes, note] });
        continue;
      }
      const op = stampOp(
        {
          id: newOpId(),
          kind: "create",
          change: { name: file.name },
          pictureBlob: set.screen,
          thumbBlob: set.thumb,
          createdAt: new Date().toISOString(),
          tries: 0,
        },
        this.session.principal,
      ) as PictureOp | null;
      if (!op) continue; // nobody signed in: nothing is queued
      if (set.full) op.fullBlob = set.full;
      this.previews.set(op.id, URL.createObjectURL(set.thumb));
      this.ops.set(op.id, op);
      this.publish();
      await saveOp(op);
    }
    void this.flush();
  }

  dismissNote(key: string): void {
    this.publish({ notes: this.state.notes.filter((n) => n.key !== key) });
  }

  tryAgain(opId: string): void {
    const op = this.ops.get(opId);
    if (!op) return;
    const next: PictureOp = { ...resetForRetry(op) } as PictureOp;
    this.ops.set(opId, next);
    void saveOp(next).then(() => this.flush());
    this.publish();
  }

  // ---- sending ------------------------------------------------------------
  /** Wi-Fi may have come back, or the page is online again. */
  poke = (): void => {
    void this.flush();
  };

  async flush(): Promise<void> {
    if (this.flushing || this.disposed) return;
    this.flushing = true;
    try {
      const ordered = [...this.ops.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const op of ordered) {
        if (op.stuckSentence) continue;
        if (this.disposed) return;
        if (!this.ops.has(op.id)) continue;
        // an op whose main steps are done and whose full copy waits for Wi-Fi stays until Wi-Fi is seen
        if (waitsForWifi(op) && onCellular() !== false) continue;
        this.sending.add(op.id);
        this.publish();
        try {
          const complete = await this.send(op);
          if (!complete) {
            // saved, but the full-size copy waits for Wi-Fi: keep the op (its progress is stored), show the picture as stored
            await saveOp(op);
            this.sending.delete(op.id);
            this.publish();
            await this.loadStored();
            continue;
          }
          await dropOp(op.id);
          this.ops.delete(op.id);
          const prev = this.previews.get(op.id);
          if (prev) {
            for (const uri of [op.masterEntity, op.thumbEntity, op.fullEntity]) if (uri) this.savedPreview.set(uri, prev);
            this.previews.delete(op.id);
          }
          this.sending.delete(op.id);
          this.publish();
          await this.loadStored();
        } catch (e) {
          this.sending.delete(op.id);
          const kind = classifyWith(e, TESTS);
          const failure = pictureFailure(e);
          if (kind === "drop") {
            await dropOp(op.id);
            this.ops.delete(op.id);
            this.publish({ notes: [...this.state.notes, { key: op.id, name: String(op.change.name ?? "picture"), failure }] });
          } else {
            const next = afterFailure(op, kind, `${failure.sentence} ${failure.next}`) as PictureOp;
            this.ops.set(op.id, next);
            await saveOp(next);
            this.publish();
            if (kind === "busy" && !next.stuckSentence) {
              this.deps.setTimer(() => void this.flush(), busyDelayMs(next.busyFails ?? 1));
            }
            if (stopsFlush(kind)) break;
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** One op. A finished step is in the op's progress and is never sent again. */
  private async send(op: PictureOp): Promise<boolean> {
    const wifi = onCellular() === false;
    const target = this.target();
    const sink = progressForOp(op);
    const name = String(op.change.name ?? "picture").replace(/\.[^.]*$/, "") || "picture";
    if (!op.masterEntity || !op.thumbLinked) {
      const withFull = wifi && op.fullBlob ? op.fullBlob : undefined;
      const master = new File([op.pictureBlob!], `${name}.jpg`, { type: op.pictureBlob!.type });
      await uploadWithThumb(master, op.thumbBlob!, sink, target, withFull);
      // The small copy and the links are best effort in the unit (a failure only warns). Left undone, the op stays and is tried again.
      if (!op.thumbLinked) throw new TypeError("The small copy could not be saved yet.");
    }
    if (op.fullBlob && !op.fullEntity && wifi) {
      const progress: UploadProgress = { ...(sink.progress ?? {}), masterEntity: op.masterEntity, thumbEntity: op.thumbEntity, thumbLinked: op.thumbLinked };
      const done = await linkFullLater(progress, op.fullBlob, { onProgress: sink.onProgress }, target, name);
      if (!done.fullEntity || !done.masterLinked) throw new Error("The full-size copy could not be linked yet.");
    }
    return !waitsForWifi(op);
  }
}

/**
 * The queue's progressOf keeps three steps (master, small copy, link). The full copy adds three more
 * (fullEntity, masterLinked, thumbRelinked); without them a retry would upload the full copy again.
 * This starts from progressOf and adds the three the op already holds (onProgress itself does write them onto the op).
 */
export function progressForOp(op: PictureOp): ProgressSink {
  const base = progressOf(op);
  const progress: UploadProgress = { ...base.progress, fullEntity: op.fullEntity, masterLinked: op.masterLinked, thumbRelinked: op.thumbRelinked };
  return {
    progress,
    onProgress: (p: UploadProgress) => base.onProgress(p),
  };
}

/** Main steps done, a full copy exists and has not been sent: it waits for Wi-Fi. */
export function waitsForWifi(op: PictureOp): boolean {
  return Boolean(op.masterEntity && op.thumbLinked && op.fullBlob && !op.fullEntity);
}
