// useProjectLevels against a fake host. The host here is example.test: it records every call in order, and its level
// query returns whatever the test sets.
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { ProjectLevelsHostContext, useProjectLevels, type AllLevelsResult, type ProjectLevelsHost } from "./index";

const V = "https://p.example.test/vault";
const UNREAD = "Could not read every level of this vault.";

function record(id: string, token: string, position: number): GridRecord {
  return {
    id,
    entityUri: `${V}/e/${id}`,
    typeUri: "t:CauseEffectLevel",
    facts: { unitTag: `Level.${token}`, label: token, levelPosition: String(position) },
    opaqueFacts: [],
    etag: null,
    updatedAt: 1,
  };
}

const PENDING: AllLevelsResult = { isSuccess: false, isError: false, error: null };
const ok = (data: GridRecord[]): AllLevelsResult => ({ data, isSuccess: true, isError: false, error: null });

function fake(initial: AllLevelsResult) {
  const state = { result: initial, log: [] as string[], waitFails: null as Error | null, ensured: [record("e", "Ensured", 1)], added: "Added.Token" };
  const host: ProjectLevelsHost = {
    useAllLevels(vaultId) {
      state.log.push(`use ${vaultId}`);
      return state.result;
    },
    async waitForLevels(vaultId) {
      state.log.push(`wait ${vaultId}`);
      if (state.waitFails) throw state.waitFails;
    },
    async ensureDefaultLevels(vaultId) {
      state.log.push(`ensure ${vaultId}`);
      return state.ensured;
    },
    async addProjectLevel(vaultId, label, parentToken) {
      state.log.push(`add ${vaultId} ${JSON.stringify(label)} ${parentToken}`);
      return state.added;
    },
  };
  return { state, host };
}

const withHost = (host: ProjectLevelsHost) => ({ children }: { children: ReactNode }) => (
  <ProjectLevelsHostContext.Provider value={host}>{children}</ProjectLevelsHostContext.Provider>
);

function mount(initial: AllLevelsResult, vaultId = V) {
  const f = fake(initial);
  const view = renderHook(({ id }) => useProjectLevels(id), { initialProps: { id: vaultId }, wrapper: withHost(f.host) });
  return { ...f, ...view };
}

describe("tree and hasStored", () => {
  it("is the four defaults, not stored, while the query is pending", () => {
    const { result } = mount(PENDING);
    expect(result.current.tree.map((n) => n.token)).toEqual(["Business", "Stakeholder", "Product", "Solution"]);
    expect(result.current.hasStored).toBe(false);
  });

  it("is the four defaults when the read succeeded and found no level", () => {
    const { result } = mount(ok([]));
    expect(result.current.hasStored).toBe(false);
    expect(result.current.tree.map((n) => n.token)).toEqual(["Business", "Stakeholder", "Product", "Solution"]);
    expect(result.current.tree.every((n) => n.record === null)).toBe(true);
  });

  it("is the stored tree when the read succeeded with levels", () => {
    const { result } = mount(ok([record("b", "Beta", 2), record("a", "Alpha", 1)]));
    expect(result.current.hasStored).toBe(true);
    expect(result.current.tree.map((n) => n.token)).toEqual(["Alpha", "Beta"]);
    expect(result.current.tree[0]!.record?.id).toBe("a");
  });

  it("does not use data from a query that has not succeeded", () => {
    const { result } = mount({ data: [record("a", "Alpha", 1)], isSuccess: false, isError: false, error: null });
    expect(result.current.hasStored).toBe(false);
    expect(result.current.tree.map((n) => n.token)).toEqual(["Business", "Stakeholder", "Product", "Solution"]);
  });

  it("shows the defaults when the query failed", () => {
    const { result } = mount({ isSuccess: false, isError: true, error: new Error("down") });
    expect(result.current.hasStored).toBe(false);
    expect(result.current.tree).toHaveLength(4);
  });

  it("keeps the same tree across renders while the host returns the same data array", () => {
    const { result, rerender, state } = mount(ok([record("a", "Alpha", 1)]));
    const first = result.current.tree;
    rerender({ id: V });
    rerender({ id: V });
    expect(result.current.tree).toBe(first);
    state.result = ok([record("a", "Alpha", 1)]);
    rerender({ id: V });
    expect(result.current.tree).not.toBe(first);
    expect(result.current.tree.map((n) => n.token)).toEqual(["Alpha"]);
  });

  it("builds the tree again on every render while the query has no data (the empty list is new each time)", () => {
    const { result, rerender } = mount(PENDING);
    const first = result.current.tree;
    rerender({ id: V });
    expect(result.current.tree).not.toBe(first);
    expect(result.current.tree).toEqual(first);
  });

  it("changes from the defaults to the stored tree when the query succeeds", () => {
    const { result, rerender, state } = mount(PENDING);
    state.result = ok([record("a", "Alpha", 1)]);
    rerender({ id: V });
    expect(result.current.hasStored).toBe(true);
    expect(result.current.tree.map((n) => n.token)).toEqual(["Alpha"]);
  });
});

describe("the host query hook", () => {
  it("is called once per render, with the vault id, and nothing else is called while rendering", () => {
    const { state, rerender } = mount(ok([]));
    expect(state.log).toEqual([`use ${V}`]);
    rerender({ id: "https://q.example.test/vault" });
    expect(state.log).toEqual([`use ${V}`, "use https://q.example.test/vault"]);
  });

  it("is called with an empty vault id too (the host decides not to read)", () => {
    const { state } = mount(PENDING, "");
    expect(state.log).toEqual(["use "]);
  });
});

describe("ensure", () => {
  it("calls only ensureDefaultLevels once the query has succeeded, and returns what it returns", async () => {
    const { result, state } = mount(ok([]));
    state.log.length = 0;
    await expect(result.current.ensure()).resolves.toBe(state.ensured);
    expect(state.log).toEqual([`ensure ${V}`]);
  });

  it("waits for the level read first while the query is neither a success nor a failure, then ensures", async () => {
    const { result, state } = mount(PENDING);
    state.log.length = 0;
    await expect(result.current.ensure()).resolves.toBe(state.ensured);
    expect(state.log).toEqual([`wait ${V}`, `ensure ${V}`]);
  });

  it("throws the query's own Error, and calls nothing, when the query failed", async () => {
    const boom = new Error("down");
    const { result, state } = mount({ isSuccess: false, isError: true, error: boom });
    state.log.length = 0;
    await expect(result.current.ensure()).rejects.toBe(boom);
    expect(state.log).toEqual([]);
  });

  it("throws the unread sentence when the query failed with something that is not an Error", async () => {
    const { result } = mount({ isSuccess: false, isError: true, error: "nope" });
    await expect(result.current.ensure()).rejects.toThrow(UNREAD);
    const { result: second } = mount({ isSuccess: false, isError: true, error: null });
    await expect(second.current.ensure()).rejects.toThrow(UNREAD);
  });

  it("does not ensure when the wait fails, and passes that failure on", async () => {
    const { result, state } = mount(PENDING);
    state.waitFails = new Error("wait failed");
    state.log.length = 0;
    await expect(result.current.ensure()).rejects.toThrow("wait failed");
    expect(state.log).toEqual([`wait ${V}`]);
  });

  it("uses the state of the render it came from", async () => {
    const { result, state, rerender } = mount(PENDING);
    const before = result.current.ensure;
    state.result = ok([]);
    rerender({ id: V });
    state.log.length = 0;
    await result.current.ensure();
    expect(state.log).toEqual([`ensure ${V}`]);
    state.log.length = 0;
    await before();
    expect(state.log).toEqual([`wait ${V}`, `ensure ${V}`]);
  });
});

describe("add", () => {
  it("calls only addProjectLevel with the vault, the label as given and the parent, and returns the token", async () => {
    const { result, state } = mount(ok([]));
    state.log.length = 0;
    await expect(result.current.add("  Sub Product ", "Product")).resolves.toBe("Added.Token");
    expect(state.log).toEqual([`add ${V} "  Sub Product " Product`]);
    state.log.length = 0;
    await result.current.add("Main", null);
    expect(state.log).toEqual([`add ${V} "Main" null`]);
  });

  it("waits for the level read first while the query is pending, then adds", async () => {
    const { result, state } = mount(PENDING);
    state.log.length = 0;
    await result.current.add("Main", null);
    expect(state.log).toEqual([`wait ${V}`, `add ${V} "Main" null`]);
  });

  it("throws and calls nothing when the query failed", async () => {
    const boom = new Error("down");
    const { result, state } = mount({ isSuccess: false, isError: true, error: boom });
    state.log.length = 0;
    await expect(result.current.add("Main", null)).rejects.toBe(boom);
    expect(state.log).toEqual([]);
    const { result: other } = mount({ isSuccess: false, isError: true, error: undefined });
    await expect(other.current.add("Main", null)).rejects.toThrow(UNREAD);
  });

  it("does not add when the wait fails", async () => {
    const { result, state } = mount(PENDING);
    state.waitFails = new Error("wait failed");
    state.log.length = 0;
    await expect(result.current.add("Main", null)).rejects.toThrow("wait failed");
    expect(state.log).toEqual([`wait ${V}`]);
  });
});

describe("the callbacks", () => {
  it("keep their identity while the vault, the host and the query's status stay the same", () => {
    const { result, rerender } = mount(ok([record("a", "Alpha", 1)]));
    const { ensure, add } = result.current;
    rerender({ id: V });
    expect(result.current.ensure).toBe(ensure);
    expect(result.current.add).toBe(add);
  });

  it("change when the vault id changes, when the status changes, and when the host object changes", () => {
    const f = fake(PENDING);
    let current = f.host;
    const view = renderHook(({ id }) => useProjectLevels(id), {
      initialProps: { id: V },
      wrapper: ({ children }: { children: ReactNode }) => <ProjectLevelsHostContext.Provider value={current}>{children}</ProjectLevelsHostContext.Provider>,
    });
    const first = view.result.current;
    view.rerender({ id: "https://q.example.test/vault" });
    const second = view.result.current;
    expect(second.ensure).not.toBe(first.ensure);
    expect(second.add).not.toBe(first.add);
    f.state.result = ok([]);
    view.rerender({ id: "https://q.example.test/vault" });
    const third = view.result.current;
    expect(third.ensure).not.toBe(second.ensure);
    view.rerender({ id: "https://q.example.test/vault" });
    expect(view.result.current.ensure).toBe(third.ensure);
    const g = fake(ok([]));
    current = g.host;
    view.rerender({ id: "https://q.example.test/vault" });
    expect(view.result.current.ensure).not.toBe(third.ensure);
    expect(view.result.current.add).not.toBe(third.add);
  });
});

describe("without a provider", () => {
  it("throws an error that names the provider", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => renderHook(() => useProjectLevels(V))).toThrow(/ProjectLevelsHostContext/);
    } finally {
      console.error = quiet;
    }
  });
});
