// Ported from the source app's src/lib/p153-background-jobs.test.ts (store-only tests), src/rc13-fixes.test.tsx (M1, M2, L2) and src/p153-s8-when-checked.test.tsx (cancelJobs). Same inputs and expectations;
// the store comes from createBackgroundJobs(hostOptions()) and the storage key is "test.jobIntents".
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { EnqueueArgs, JobResult } from "./backgroundJobs";
import { STORAGE_KEY, WHEN_CHECKED, failText, makeJobs } from "./testHost";

const J = makeJobs();
const { __resetForTests, activeJobOf, anyActive, clearDraft, dismiss, enqueue, jobKey, jobsOf, noticesOf, onFinished, toastsOf, unfinishedOf, setJobPrincipal, cancelJobs } = J;

const W1 = "https://v.example/w1", W2 = "https://v.example/w2";
beforeEach(() => __resetForTests());
afterEach(() => __resetForTests());
/** A run the test finishes by hand. */
function gate() {
  let done: (r: JobResult) => void = () => undefined;
  const p = new Promise<JobResult>((res) => { done = res; });
  const fn = vi.fn(() => p);
  return { fn, done };
}
const args = (o: Partial<EnqueueArgs> & { run: EnqueueArgs["run"] }, ws = W1, draft = "d1", kind: "queue" | "postNow" = "queue"): EnqueueArgs => ({ key: jobKey(ws, kind, draft), kind, draftId: draft, workspace: ws, label: `Add to queue: ${draft}`, ...o });
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

describe("one flight per key", () => {
  test("a second enqueue with the same key returns the running job and runs nothing", async () => {
    const g = gate();
    const a = enqueue(args({ run: g.fn }));
    const b = enqueue(args({ run: g.fn }));
    await settle();
    expect(b.key).toBe(a.key);
    expect(g.fn).toHaveBeenCalledTimes(1);
    expect(jobsOf(W1)).toHaveLength(1);
    g.done({ ok: true, message: "x" });
    await settle();
    expect(g.fn).toHaveBeenCalledTimes(1);
    // once it has ended the same key may run again
    const g2 = gate();
    enqueue(args({ run: g2.fn }));
    await settle();
    expect(g2.fn).toHaveBeenCalledTimes(1);
  });
  test("the key is vault, kind and draft: another kind or draft is another job", async () => {
    const g = gate();
    enqueue(args({ run: g.fn }, W1, "d1", "queue"));
    enqueue(args({ run: g.fn }, W1, "d1", "postNow"));
    enqueue(args({ run: g.fn }, W1, "d2", "queue"));
    expect(jobsOf(W1)).toHaveLength(3);
  });
});

describe("one workspace runs one job at a time, in order; workspaces are independent", () => {
  test("FIFO in one workspace: the second starts only when the first has ended", async () => {
    const order: string[] = [];
    let running = 0, peak = 0;
    const mk = (name: string) => async (): Promise<JobResult> => { running++; peak = Math.max(peak, running); order.push(`start ${name}`); await new Promise((r) => setTimeout(r, 15)); order.push(`end ${name}`); running--; return { ok: true, message: name }; };
    enqueue(args({ run: mk("a") }, W1, "a"));
    enqueue(args({ run: mk("b") }, W1, "b"));
    enqueue(args({ run: mk("c") }, W1, "c"));
    expect(jobsOf(W1).map((j) => j.state)).toEqual(["running", "queued", "queued"]);
    await vi.waitFor(() => expect(anyActive()).toBe(false));
    expect(peak).toBe(1);
    expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });
  test("another workspace runs at the same time", async () => {
    const g1 = gate(), g2 = gate();
    enqueue(args({ run: g1.fn }, W1, "a"));
    enqueue(args({ run: g2.fn }, W2, "a"));
    await settle();
    expect(g1.fn).toHaveBeenCalledTimes(1);
    expect(g2.fn).toHaveBeenCalledTimes(1);
  });
});

describe("a job outlives its page, and a failure becomes a notice", () => {
  test("it keeps running and finishes with nobody subscribed; the finished listener hears it once", async () => {
    const g = gate();
    const heard: string[] = [];
    const off = onFinished((j) => heard.push(`${j.state}:${j.draftId}`));
    enqueue(args({ run: g.fn }));
    await settle(); // (no component, no subscriber)
    g.done({ ok: true, message: "Added to the queue for Thu 15:00." });
    await settle();
    expect(heard).toEqual(["done:d1"]);
    expect(toastsOf(W1).map((t) => t.text)).toEqual(["Added to the queue for Thu 15:00."]);
    off();
  });
  test("a failed run (or a throw) leaves a notice until it is dismissed; another workspace does not see it", async () => {
    enqueue(args({ run: async () => ({ ok: false, message: "Not approved. It is outside your posting days. Nothing was recorded." }) }, W1, "a"));
    enqueue(args({ run: async () => { throw new Error("boom"); } }, W1, "b"));
    await vi.waitFor(() => expect(noticesOf(W1)).toHaveLength(2));
    const n = noticesOf(W1)[0]!;
    expect(n).toMatchObject({ kind: "queue", draftId: "a", workspace: W1 });
    expect(n.text).toBe("Not added: Not approved. It is outside your posting days. Nothing was recorded. Open the draft.");
    expect(typeof n.at).toBe("number");
    expect(noticesOf(W2)).toEqual([]);
    dismiss(W1, n.key);
    expect(noticesOf(W1)).toHaveLength(1);
    clearDraft(W1, "b"); // the draft was acted on
    expect(noticesOf(W1)).toEqual([]);
  });
  test("enqueue for the draft again clears its old notice", async () => {
    enqueue(args({ run: async () => ({ ok: false, message: "no" }) }));
    await vi.waitFor(() => expect(noticesOf(W1)).toHaveLength(1));
    const g = gate();
    enqueue(args({ run: g.fn }));
    expect(noticesOf(W1)).toEqual([]);
  });
  test("failText (the host's wording, here the source app's): 'Approved, not posted: why.' is kept whole; a post-now refusal that is not an approval gets 'Not posted'", () => {
    expect(failText("postNow", "Approved, not posted: it is outside your window.")).toBe("Approved, not posted: it is outside your window.");
    expect(failText("postNow", "Something.")).toBe("Not posted: Something. Open the draft.");
    expect(failText("queue", "Approved. Not given a posting time: off.")).toBe("Approved. Not given a posting time: off.");
  });
});

describe("a failed run is NEVER retried", () => {
  test("run is called once, whatever it answers", async () => {
    const run = vi.fn(async (): Promise<JobResult> => ({ ok: false, message: "Approved, not posted: refused." }));
    enqueue(args({ run }, W1, "d1", "postNow"));
    await vi.waitFor(() => expect(anyActive()).toBe(false));
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    const thrower = vi.fn(async (): Promise<JobResult> => { throw new Error("lost"); });
    enqueue(args({ run: thrower }, W1, "d2", "postNow"));
    await vi.waitFor(() => expect(anyActive()).toBe(false));
    await settle();
    expect(thrower).toHaveBeenCalledTimes(1);
  });
});

describe("the snapshot guard", () => {
  test("when the re-read says what was shown no longer holds: run is never called, nothing is written, a notice says why", async () => {
    const run = vi.fn(async (): Promise<JobResult> => ({ ok: true, message: "wrote" }));
    enqueue(args({ run, recheck: async () => "The warnings changed. Look again." }));
    await vi.waitFor(() => expect(noticesOf(W1)).toHaveLength(1));
    expect(run).not.toHaveBeenCalled();
    expect(noticesOf(W1)[0]!.text).toBe("Not added: The warnings changed. Look again. Open the draft.");
    expect(jobsOf(W1)[0]!.state).toBe("failed");
  });
  test("when it still holds, run is called after the re-read", async () => {
    const seen: string[] = [];
    enqueue(args({ recheck: async () => { seen.push("recheck"); return null; }, run: async () => { seen.push("run"); return { ok: true, message: "ok" }; } }));
    await vi.waitFor(() => expect(anyActive()).toBe(false));
    expect(seen).toEqual(["recheck", "run"]);
  });
});

describe("the leave-the-page prompt", () => {
  test("it is set while a job is queued or running, and removed when none remain", async () => {
    const add = vi.spyOn(window, "addEventListener"), remove = vi.spyOn(window, "removeEventListener");
    const g = gate();
    enqueue(args({ run: g.fn }));
    expect(add.mock.calls.filter((c) => c[0] === "beforeunload")).toHaveLength(1);
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    enqueue(args({ run: g.fn }, W1, "d2")); // a second job does not add a second handler
    expect(add.mock.calls.filter((c) => c[0] === "beforeunload")).toHaveLength(1);
    g.done({ ok: true, message: "ok" });
    await vi.waitFor(() => expect(anyActive()).toBe(false));
    expect(remove.mock.calls.filter((c) => c[0] === "beforeunload")).toHaveLength(1);
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    add.mockRestore(); remove.mockRestore();
  });
});

describe("the intent record: shown after a reload, never run again", () => {
  test("an intent is written at enqueue, removed when the job ends", async () => {
    const g = gate();
    enqueue(args({ run: g.fn, snapshot: "sha256:abc" }));
    const kept = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ kind: "queue", draftId: "d1", snapshot: "sha256:abc" });
    expect(typeof kept[0].at).toBe("number");
    g.done({ ok: true, message: "ok" });
    await vi.waitFor(() => expect(anyActive()).toBe(false));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
  test("after a reload mid-job: 'This action did not finish: <label>. Open the draft to check.', in its own workspace, and run is never called again", async () => {
    const run = vi.fn((): Promise<JobResult> => new Promise(() => undefined)); // the job the reload cut off
    enqueue(args({ run, label: "Add to queue: Why the bank held" }));
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    __resetForTests({ reload: true });
    await settle();
    expect(unfinishedOf(W1).map((u) => u.text)).toEqual(["This action did not finish: Add to queue: Why the bank held. Open the draft to check."]);
    expect(unfinishedOf(W2)).toEqual([]);
    expect(jobsOf(W1)).toEqual([]);
    expect(anyActive()).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    // a second reload keeps it until it is dismissed
    __resetForTests({ reload: true });
    expect(unfinishedOf(W1)).toHaveLength(1);
    dismiss(W1, unfinishedOf(W1)[0]!.key);
    expect(unfinishedOf(W1)).toEqual([]);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
  test("acting on the draft again clears its 'did not finish' line", async () => {
    enqueue(args({ run: () => new Promise(() => undefined) }));
    __resetForTests({ reload: true });
    expect(unfinishedOf(W1)).toHaveLength(1);
    const g = gate();
    enqueue(args({ run: g.fn }));
    expect(unfinishedOf(W1)).toEqual([]);
    expect(activeJobOf(W1, "d1")).toBeTruthy();
  });
  // from rc13-fixes M1 (store part)
  test("picture and pick jobs keep an intent record too; a pick says 'Open Topics'", async () => {
    const never = () => new Promise<never>(() => undefined);
    enqueue({ key: "w|picture|d", kind: "picture", draftId: "d", workspace: "w", label: "Try another picture: T", free: true, run: never });
    enqueue({ key: "w|pick|t", kind: "pick", draftId: "t", workspace: "w", label: "Write a draft: Topic 1", free: true, run: never });
    __resetForTests({ reload: true });
    expect(unfinishedOf("w").map((u) => u.text).sort()).toEqual(["This action did not finish: Try another picture: T. Open the draft to check.", "This action did not finish: Write a draft: Topic 1. Open Topics to check."]);
  });
});

describe("M2 (rc13): a refused pick after the page is gone leaves a notice; with the page there it stays quiet", () => {
  test("not quiet: 'Not requested: <why>. Open Topics.'; quiet: no notice", async () => {
    enqueue({ key: "w|pick|a", kind: "pick", draftId: "a", workspace: "w", label: "Write a draft: A", free: true, run: async () => ({ ok: false, message: "The app could not write the draft request just now, so no draft was requested" }) });
    enqueue({ key: "w|pick|b", kind: "pick", draftId: "b", workspace: "w", label: "Write a draft: B", free: true, run: async () => ({ ok: false, quiet: true, message: "x" }) });
    await vi.waitFor(() => expect(anyActive()).toBe(false));
    expect(noticesOf("w").map((n) => n.text)).toEqual(["Not requested: The app could not write the draft request just now, so no draft was requested. Open Topics."]);
  });
});

describe("L2 (rc13): 'did not finish' lines belong to the person and the workspace", () => {
  const never = () => new Promise<never>(() => undefined);
  test("the same person after a reload sees them; another person signing in in this tab sees none, and they are cleared; a workspace sees only its own", async () => {
    setJobPrincipal("https://a.example/vault");
    enqueue({ key: "w1|queue|d", kind: "queue", draftId: "d", workspace: "w1", label: "Add to queue: T", run: never });
    enqueue({ key: "w2|queue|d", kind: "queue", draftId: "d", workspace: "w2", label: "Add to queue: U", run: never });
    __resetForTests({ reload: true });
    expect(unfinishedOf("w1")).toHaveLength(1);
    expect(unfinishedOf("w2")).toHaveLength(1);
    expect(unfinishedOf("w1")[0]!.text).toContain("T");
    setJobPrincipal("https://b.example/vault"); // another person in this tab
    expect(unfinishedOf("w1")).toEqual([]);
    expect(unfinishedOf("w2")).toEqual([]);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    __resetForTests({ reload: true });
    expect(unfinishedOf("w1")).toEqual([]);
  });
});

describe("a further edit cancels the job (from p153-s8, store part)", () => {
  test("cancelJobs: a waiting job of the given kinds stops quietly, no notice, and run is never called", async () => {
    const g = gate();
    enqueue(args({ run: g.fn }, W1, "blocker"));
    const run = vi.fn(async (): Promise<JobResult> => ({ ok: true, message: "wrote" }));
    enqueue({ key: jobKey(W1, "queueWhenChecked", "d1"), kind: "queueWhenChecked", draftId: "d1", workspace: W1, label: "x", run });
    expect(cancelJobs(W1, "d1", WHEN_CHECKED)).toBe(1);
    g.done({ ok: true, message: "ok" });
    await vi.waitFor(() => expect(anyActive()).toBe(false));
    expect(run).not.toHaveBeenCalled();
    expect(noticesOf(W1)).toEqual([]);
    expect(jobsOf(W1).at(-1)).toMatchObject({ state: "failed", message: "Cancelled: the draft was edited again." });
  });
  test("a job that waits on the world (free) does not hold the workspace lane: another job runs meanwhile", async () => {
    const hold = new Promise<JobResult>(() => undefined);
    enqueue({ key: "f1", kind: "queueWhenChecked", draftId: "head", workspace: W1, label: "x", free: true, run: () => hold });
    let ran = false;
    enqueue({ key: "k1", kind: "queue", draftId: "other", workspace: W1, label: "x", run: async () => { ran = true; return { ok: true, message: "ok" }; } });
    await vi.waitFor(() => expect(ran).toBe(true));
  });
});

describe("workspace switch", () => {
  test("jobs of the old workspace keep running; their notices show only there", async () => {
    const g = gate();
    enqueue(args({ run: g.fn }, W1, "a"));
    await settle();
    expect(activeJobOf(W1, "a")).toBeTruthy();
    expect(activeJobOf(W2, "a")).toBeUndefined();
    g.done({ ok: false, message: "nope" });
    await vi.waitFor(() => expect(noticesOf(W1)).toHaveLength(1));
    expect(noticesOf(W2)).toEqual([]);
  });
});
