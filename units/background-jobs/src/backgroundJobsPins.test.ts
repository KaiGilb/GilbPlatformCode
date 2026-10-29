// New. Pins every export of the unit and each option, against createBackgroundJobs(hostOptions()) and variants.
import { afterEach, describe, expect, test, vi } from "vitest";
import * as api from "./index";
import { createBackgroundJobs } from "./index";
import { registeredCaches, setPrincipal, __freshPageForTests } from "@kaigilb/gilbplatformcode-principal-hub";
import { STORAGE_KEY, WHEN_CHECKED, hostOptions, makeJobs } from "./testHost";

afterEach(() => { __freshPageForTests(); sessionStorage.clear(); });
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const base = (kind = "queue", draft = "d", ws = "w") => ({ key: `${ws}|${kind}|${draft}`, kind, draftId: draft, workspace: ws, label: "L" });

describe("the export surface", () => {
  test("the module exports createBackgroundJobs and nothing else at run time", () => { expect(Object.keys(api).sort()).toEqual(["createBackgroundJobs"]); });
  test("an instance has exactly these members", () => {
    expect(Object.keys(makeJobs()).sort()).toEqual(["__resetForTests", "activeJobOf", "anyActive", "cancelJobs", "clearDraft", "dismiss", "enqueue", "forgetPersonViews", "getVersion", "isPending", "jobKey", "jobsIdle", "jobsOf", "noticesOf", "onFinished", "setJobPrincipal", "subscribe", "toastsOf", "unfinishedOf"]);
  });
});

describe("members", () => {
  test("jobKey is vault|kind|draft", () => { expect(makeJobs().jobKey("v", "queue", "d")).toBe("v|queue|d"); });
  test("subscribe is told on every change and stops when removed; getVersion moves with it", async () => {
    const J = makeJobs(); J.__resetForTests();
    const l = vi.fn(); const off = J.subscribe(l); const v0 = J.getVersion();
    J.enqueue({ ...base(), run: async () => ({ ok: true, message: "m" }) });
    await J.jobsIdle();
    expect(l.mock.calls.length).toBeGreaterThan(1);
    expect(J.getVersion()).toBeGreaterThan(v0);
    off(); const n = l.mock.calls.length; J.dismiss("w", "none"); expect(l.mock.calls.length).toBe(n);
  });
  test("isPending and anyActive follow queued/running; jobsIdle resolves when none remain", async () => {
    const J = makeJobs(); J.__resetForTests();
    let end: () => void = () => undefined;
    const job = J.enqueue({ ...base(), run: () => new Promise((r) => { end = () => r({ ok: true, message: "m" }); }) });
    expect(J.isPending(job.key)).toBe(true); expect(J.anyActive()).toBe(true);
    const idle = J.jobsIdle(); let done = false; void idle.then(() => { done = true; });
    await settle(); expect(done).toBe(false);
    end(); await idle;
    expect(J.isPending(job.key)).toBe(false); expect(J.anyActive()).toBe(false);
  });
  test("a returned job is a snapshot with the args' members; refs are kept; data of a done job is on the job", async () => {
    const J = makeJobs(); J.__resetForTests();
    const j = J.enqueue({ ...base("picture", "d"), refs: ["c1", "c2"], run: async () => ({ ok: true, message: "m", data: { n: 1 } }) });
    expect(j).toMatchObject({ key: "w|picture|d", kind: "picture", draftId: "d", workspace: "w", label: "L", state: "running", message: "", refs: ["c1", "c2"] });
    await J.jobsIdle();
    expect(J.jobsOf("w")[0]).toMatchObject({ state: "done", message: "m", data: { n: 1 } });
  });
  test("a signal's exclusive runs a part in the workspace lane, behind the jobs there", async () => {
    const J = makeJobs(); J.__resetForTests();
    const order: string[] = [];
    J.enqueue({ ...base("picture", "p"), free: true, run: async (s) => {
      await s.exclusive(async () => { order.push("part"); });
      return { ok: true, message: "m" };
    } });
    J.enqueue({ ...base("queue", "q"), run: async () => { order.push("q-start"); await new Promise((r) => setTimeout(r, 10)); order.push("q-end"); return { ok: true, message: "m" }; } });
    await J.jobsIdle(); await settle();
    expect(order).toEqual(["part", "q-start", "q-end"]);
  });
  test("a free job runs at once (state running) without waiting for the lane", async () => {
    const J = makeJobs(); J.__resetForTests();
    J.enqueue({ ...base("queue", "q"), run: () => new Promise(() => undefined) });
    const f = J.enqueue({ ...base("pick", "f"), free: true, run: () => new Promise(() => undefined) });
    expect(J.jobsOf("w").find((j) => j.key === f.key)!.state).toBe("running");
  });
  test("cancelJobs returns the count, ignores other kinds, other drafts and jobs already cancelled", async () => {
    const J = makeJobs(); J.__resetForTests();
    J.enqueue({ ...base("queue", "a"), run: () => new Promise(() => undefined) });
    J.enqueue({ ...base("queueWhenChecked", "a"), run: async () => ({ ok: true, message: "m" }) });
    J.enqueue({ ...base("postWhenChecked", "b"), run: async () => ({ ok: true, message: "m" }) });
    expect(J.cancelJobs("w", "a", WHEN_CHECKED)).toBe(1);
    expect(J.cancelJobs("w", "a", WHEN_CHECKED)).toBe(0);
    expect(J.cancelJobs("other", "a", WHEN_CHECKED)).toBe(0);
    expect(J.cancelJobs("w", "a", [])).toBe(0);
  });
  test("activeJobOf finds the queued/running job of a draft, not a finished one", async () => {
    const J = makeJobs(); J.__resetForTests();
    J.enqueue({ ...base("queue", "a"), run: async () => ({ ok: true, message: "m" }) });
    expect(J.activeJobOf("w", "a")).toBeTruthy();
    await J.jobsIdle();
    expect(J.activeJobOf("w", "a")).toBeUndefined();
  });
});

describe("options", () => {
  test("quietSuccessKinds: a success of that kind leaves no toast; any other kind does; with no option every success leaves one", async () => {
    const J = makeJobs(); J.__resetForTests();
    J.enqueue({ ...base("pick", "p"), free: true, run: async () => ({ ok: true, message: "said by the page" }) });
    J.enqueue({ ...base("queue", "q"), run: async () => ({ ok: true, message: "said by the job" }) });
    await J.jobsIdle();
    expect(J.toastsOf("w").map((t) => t.text)).toEqual(["said by the job"]);
    expect(J.jobsOf("w").find((j) => j.kind === "pick")).toMatchObject({ state: "done", message: "said by the page" });
    const K = makeJobs({ quietSuccessKinds: undefined, storageKey: "other.key" }); K.__resetForTests();
    K.enqueue({ ...base("pick", "p"), free: true, run: async () => ({ ok: true, message: "x" }) });
    await K.jobsIdle();
    expect(K.toastsOf("w")).toHaveLength(1);
  });
  test("crashText is the message of a job whose run throws; cancelledText that of a cancelled one", async () => {
    const J = makeJobs({ crashText: "CRASH", cancelledText: "CANCELLED" }); J.__resetForTests();
    J.enqueue({ ...base("queue", "a"), run: async () => { throw new Error("x"); } });
    J.enqueue({ ...base("queue", "b"), recheck: async () => { throw new Error("y"); }, run: async () => ({ ok: true, message: "m" }) });
    await J.jobsIdle();
    expect(J.jobsOf("w").map((j) => j.message)).toEqual(["CRASH", "CRASH"]);
    let endC: () => void = () => undefined;
    J.enqueue({ ...base("queue", "c"), run: () => new Promise((r) => { endC = () => r({ ok: true, message: "m" }); }) });
    J.enqueue({ ...base("queueWhenChecked", "d"), run: async () => ({ ok: true, message: "m" }) });
    J.cancelJobs("w", "d", WHEN_CHECKED);
    endC(); await J.jobsIdle();
    expect(J.jobsOf("w").find((j) => j.draftId === "d")).toMatchObject({ state: "failed", message: "CANCELLED" });
    expect(J.noticesOf("w").filter((n) => n.draftId === "d")).toEqual([]); // a cancel is quiet; the two crashes did leave notices
  });
  test("keepFinished: only that many finished jobs stay", async () => {
    const J = makeJobs({ keepFinished: 2 }); J.__resetForTests();
    for (const d of ["a", "b", "c", "d"]) J.enqueue({ ...base("queue", d), run: async () => ({ ok: true, message: d }) });
    await J.jobsIdle();
    expect(J.jobsOf("w").map((j) => j.draftId)).toEqual(["c", "d"]);
  });
  test("the default keepFinished is 40", async () => {
    const J = makeJobs(); J.__resetForTests();
    for (let i = 0; i < 45; i++) J.enqueue({ ...base("queue", `d${i}`), run: async () => ({ ok: true, message: "m" }) });
    await J.jobsIdle();
    expect(J.jobsOf("w")).toHaveLength(40);
  });
  test("kinds: an intent of a kind not listed is not read back; storage: the given storage holds the records", async () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as unknown as Storage;
    const J = makeJobs({ storage: () => storage, storageKey: "mem.key", kinds: ["queue"] }); J.__resetForTests();
    J.enqueue({ ...base("queue", "a"), run: () => new Promise(() => undefined) });
    J.enqueue({ ...base("other", "b"), run: () => new Promise(() => undefined) });
    expect(JSON.parse(mem.get("mem.key")!).map((i: { kind: string }) => i.kind)).toEqual(["queue", "other"]); // both are written; the reader below keeps only the listed kinds
    expect(sessionStorage.getItem("mem.key")).toBeNull();
    J.__resetForTests({ reload: true });
    expect(J.unfinishedOf("w").map((u) => u.kind)).toEqual(["queue"]);
  });
  test("no storage (the getter returns null, or throws): jobs still run, nothing is kept", async () => {
    for (const storage of [() => null, () => { throw new Error("blocked"); }]) {
      const J = makeJobs({ storage }); J.__resetForTests();
      J.enqueue({ ...base(), run: async () => ({ ok: true, message: "m" }) });
      await J.jobsIdle();
      expect(J.toastsOf("w")).toHaveLength(1);
    }
  });
  test("a job's own text for a notice is the host's failText; an intent's line is the host's unfinishedText", async () => {
    const J = makeJobs({ failText: (k, m) => `F[${k}]${m}`, unfinishedText: (l, k) => `U[${k}]${l}` }); J.__resetForTests();
    J.enqueue({ ...base("queue", "a"), run: async () => ({ ok: false, message: "no" }) });
    J.enqueue({ ...base("queue", "b"), run: () => new Promise(() => undefined) });
    await settle();
    expect(J.noticesOf("w").map((n) => n.text)).toEqual(["F[queue]no"]);
    J.__resetForTests({ reload: true });
    expect(J.unfinishedOf("w").map((u) => u.text)).toEqual(["U[queue]L"]);
  });
  test("storageKey is required by the type", () => {
    // @ts-expect-error storageKey has no default
    const bad: Parameters<typeof createBackgroundJobs>[0] = { ...hostOptions(), storageKey: undefined };
    expect(bad.storageKey).toBeUndefined();
  });
});

describe("the principal", () => {
  test("setJobPrincipal: the first call keeps the same person's records and drops others'; a later change clears notices, toasts and records", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([
      { key: "w|queue|a", kind: "queue", draftId: "a", workspace: "w", label: "A", snapshot: "", at: 1, principal: "me" },
      { key: "w|queue|b", kind: "queue", draftId: "b", workspace: "w", label: "B", snapshot: "", at: 2, principal: "you" },
      { key: "w|queue|c", kind: "queue", draftId: "c", workspace: "w", label: "C", snapshot: "", at: 3 },
    ]));
    const J = makeJobs(); // reads the record list at creation: no person yet, so everything is shown
    expect(J.unfinishedOf("w")).toHaveLength(3);
    J.setJobPrincipal("me");
    expect(J.unfinishedOf("w").map((u) => u.label)).toEqual(["A"]);
    J.enqueue({ ...base("queue", "z"), run: async () => ({ ok: false, message: "n" }) });
    await J.jobsIdle();
    expect(J.noticesOf("w")).toHaveLength(1);
    J.setJobPrincipal("me"); expect(J.noticesOf("w")).toHaveLength(1); // same person again: nothing
    J.setJobPrincipal("you");
    expect(J.noticesOf("w")).toEqual([]); expect(J.unfinishedOf("w")).toEqual([]);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
  test("an intent is stamped with the person set at enqueue", () => {
    const J = makeJobs(); J.__resetForTests(); J.setJobPrincipal("me");
    J.enqueue({ ...base(), run: () => new Promise(() => undefined) });
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)[0].principal).toBe("me");
  });
  test("registers with the hub as backgroundJobs and backgroundJobIntents (or the names given); a change of person forgets the views and ends a running job silently", async () => {
    const J = makeJobs({ cacheNames: { views: "jobsA", intents: "jobsAIntents" } }); J.__resetForTests();
    expect(registeredCaches()).toEqual(expect.arrayContaining(["jobsA", "jobsAIntents"]));
    makeJobs();
    expect(registeredCaches()).toEqual(expect.arrayContaining(["backgroundJobs", "backgroundJobIntents"]));
    setPrincipal("a");
    let finish: () => void = () => undefined;
    J.enqueue({ ...base(), run: () => new Promise((r) => { finish = () => r({ ok: false, message: "alice-only reason" }); }) });
    await settle();
    setPrincipal("b");
    expect(J.jobsOf("w")).toEqual([]);
    finish(); await settle();
    expect(J.noticesOf("w")).toEqual([]);
  });
  test("a change of person to somebody else removes the other person's intent records; to nobody removes all", () => {
    const J = makeJobs(); J.__resetForTests();
    setPrincipal("a"); J.setJobPrincipal("a");
    J.enqueue({ ...base(), run: () => new Promise(() => undefined) });
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    setPrincipal("b");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("forgetPersonViews, dismiss, clearDraft", () => {
  test("forgetPersonViews empties rows, notices, toasts and lines", async () => {
    const J = makeJobs(); J.__resetForTests();
    J.enqueue({ ...base("queue", "a"), run: async () => ({ ok: false, message: "n" }) });
    J.enqueue({ ...base("queue", "b"), run: async () => ({ ok: true, message: "m" }) });
    await J.jobsIdle();
    J.forgetPersonViews();
    expect(J.jobsOf("w")).toEqual([]); expect(J.noticesOf("w")).toEqual([]); expect(J.toastsOf("w")).toEqual([]);
  });
  test("dismiss removes a toast by key; clearDraft removes the toasts and notices of a draft and tells subscribers only if something went", async () => {
    const J = makeJobs(); J.__resetForTests();
    J.enqueue({ ...base("queue", "a"), run: async () => ({ ok: true, message: "m" }) });
    await J.jobsIdle();
    const l = vi.fn(); const off = J.subscribe(l);
    J.clearDraft("w", "nobody"); expect(l).not.toHaveBeenCalled();
    J.clearDraft("w", "a"); expect(l).toHaveBeenCalledTimes(1); expect(J.toastsOf("w")).toEqual([]);
    J.enqueue({ ...base("queue", "b"), run: async () => ({ ok: true, message: "m" }) });
    await J.jobsIdle();
    J.dismiss("w", "w|queue|b"); expect(J.toastsOf("w")).toEqual([]);
    off();
  });
});
