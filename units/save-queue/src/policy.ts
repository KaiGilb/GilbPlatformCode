// The pure rules around the queue: how a failure is told apart, what an op looks like after one, when to try again, and whose ops are whose.
import { listOps, RETRY_DELAYS_MS, MAX_BUSY_FAILS, MAX_OTHER_FAILS, saveOp, type PendingOp } from "./queue";

/** `drop`: refused for good, do not retry. `network`: nothing wrong with the op, try later. `busy`: the vault said 502/503/504; retried like network, but only up to a cap. `other`: unknown; kept, and the person is told. */
export type Failure = "drop" | "network" | "busy" | "other";

export type FailureTests = {
  /** Refused for good (no access, or changed elsewhere): the op is dropped. Replaces the app's `e instanceof NoAccessError || e instanceof PlantChangedElsewhereError` (outbox.ts:14). */
  refusedForGood: (e: unknown) => boolean;
  /** The vault said 502/503/504. Replaces `e instanceof VaultBusyError` (outbox.ts:15). */
  busy: (e: unknown) => boolean;
  /** Nobody is signed in right now. Replaces `e instanceof NotSignedInError` (outbox.ts:16). */
  notSignedIn: (e: unknown) => boolean;
};
export function classifyWith(e: unknown, tests: FailureTests): Failure {
  if (tests.refusedForGood(e)) return "drop";
  if (tests.busy(e)) return "busy";
  if (e instanceof TypeError || tests.notSignedIn(e)) return "network";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  if (e instanceof Error && /failed to fetch|fetch failed|network|offline|load failed/i.test(e.message)) return "network";
  return "other";
}

/** Upload steps done so far go onto the op itself and into the queue, so a retry resumes where this stopped. */
export const progressOf = (op: PendingOp) => ({
  progress: { ...(op.masterEntity ? { masterEntity: op.masterEntity } : {}), ...(op.thumbEntity ? { thumbEntity: op.thumbEntity } : {}), ...(op.thumbLinked ? { thumbLinked: true } : {}) },
  onProgress: async (p: { masterEntity?: string; thumbEntity?: string; thumbLinked?: boolean }) => {
    Object.assign(op, p);
    await saveOp(op);
  },
});

/** The op as it is stored after a failed send that was not dropped. Source: GardenScreen.tsx runOp. */
export function afterFailure<T>(op: PendingOp<T>, kind: Exclude<Failure, "drop">, sentence: string): PendingOp<T> {
  const otherFails = (op.otherFails ?? 0) + (kind === "other" ? 1 : 0);
  const busyFails = (op.busyFails ?? 0) + (kind === "busy" ? 1 : 0);
  const busyStuck = kind === "busy" && busyFails >= MAX_BUSY_FAILS;
  return {
    ...op,
    tries: op.tries + 1,
    otherFails,
    busyFails,
    ...(kind === "busy" ? { busySentence: sentence } : {}),
    ...(otherFails >= MAX_OTHER_FAILS ? { stuckSentence: sentence } : busyStuck ? { stuckSentence: sentence } : {}),
  };
}

/** How long to wait before sending an op again after its `busyFails`-th busy answer: 2 s, 5 s, 15 s, then 30 s. */
export function busyDelayMs(busyFails: number): number {
  return RETRY_DELAYS_MS[Math.min(busyFails - 1, RETRY_DELAYS_MS.length - 1)]!;
}

/** "Try again" on a stuck op: the stuck sentence goes and both counts start over. `tries` and `busySentence` are kept. */
export function resetForRetry<T>(op: PendingOp<T>): PendingOp<T> {
  const { stuckSentence: _gone, ...rest } = op;
  return { ...rest, otherFails: 0, busyFails: 0 };
}

/** True when a flush should stop at this result: the rest would fail the same way. */
export function stopsFlush(r: Failure | "ok"): boolean {
  return r === "network" || r === "busy";
}

/** Only this person's ops. Nobody signed in: none. */
export function opsFor(ops: PendingOp[], principal: string | null): PendingOp[] {
  return ops.filter((o) => principal !== null && o.principal === principal);
}
/** The queued ops of one signed-in person, oldest first. Read the queue only through this, never send an op from `listOps` directly. */
export async function listOpsFor(principal: string | null): Promise<PendingOp[]> {
  return opsFor(await listOps(), principal);
}

/** Puts the signed-in person on an op about to be queued. Nobody signed in: null, and nothing is queued (the app tells the person). */
export function stampOp<T>(input: Omit<PendingOp<T>, "principal">, principal: string | null): PendingOp<T> | null {
  if (!principal) return null;
  return { ...input, principal };
}

/** What a queued op shows: stuck, being sent now, or waiting for the next try. */
export function opStatus(op: PendingOp, sending: boolean): "saving" | "failed" | "stuck" {
  return op.stuckSentence ? "stuck" : sending ? "saving" : "failed";
}
