// Pins of the hook against a fake host: the settle of typing, the shortest name, how long an answer is kept, the source record left out of the list,
// the vault correction and the guards of the create. Fake time only; nothing waits on the clock. The app tests the hook only inside its
// dialog's page suites, which are not ported.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __setFindPeopleForTest, STAKEHOLDER_FIND_DEBOUNCE_MS, STAKEHOLDER_FIND_MIN_CHARS } from "@kaigilb/gilbplatformcode-person-create";
import type { Candidate, FindResult } from "@kaigilb/gilbplatformcode-pick-or-create";
import {
  refreshStakeholderFinds,
  StakeholderCreateGuardError,
  STAKEHOLDER_FIND_KEY_PREFIX,
  useStakeholderCreate,
  type UseStakeholderCreateArgs,
} from "./useStakeholderCreate";
import { fakeHost, PERSON_OPTION, READING, seededClient, vault, VNS, type FakeHost } from "../test/fakeHost";

const VAULT_ID = VNS;
const cand = (id: string, label = "Ann Lee"): Candidate => ({ record: `${VNS}/e/${id}`, vaultId: VNS, type: "t:Person", label });
const answer = (...c: Candidate[]): FindResult => ({ candidates: c, complete: true, pages: 1 });

let qc: QueryClient;
let host: FakeHost;
let find: ReturnType<typeof vi.fn>;
let setOption: ReturnType<typeof vi.fn>;
let setVaultId: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  setTermOrigin("https://ontology.example.test");
  qc = seededClient();
  host = fakeHost();
  find = vi.fn(async (_r: unknown, _v: string, _text: string) => answer(cand("a1")));
  __setFindPeopleForTest(find as never);
  setOption = vi.fn();
  setVaultId = vi.fn();
});
afterEach(() => {
  __setFindPeopleForTest(null);
  resetTermOrigin();
  qc.clear();
  vi.useRealTimers();
});

function args(over: Partial<UseStakeholderCreateArgs> = {}): UseStakeholderCreateArgs {
  return {
    inStakeholders: true,
    open: true,
    mode: "plain",
    option: PERSON_OPTION,
    setOption: setOption as never,
    vaultId: VAULT_ID,
    setVaultId: setVaultId as never,
    displayName: "",
    values: {},
    source: null,
    contentScope: { readVaultId: VAULT_ID },
    vaults: [vault(VAULT_ID)],
    writable: [vault(VAULT_ID)],
    session: { principal: "https://id.platform.example.test/base/p/ann" },
    queryClient: qc,
    host,
    ...over,
  };
}

function mount(over: Partial<UseStakeholderCreateArgs> = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return renderHook((p: UseStakeholderCreateArgs) => useStakeholderCreate(p), { wrapper, initialProps: args(over) });
}
/**
 * Advances the fake clock by `ms`, then lets the answers that came back reach the hook. Each step is its own `act`: React hands a state change made
 * inside one `act` on only when that `act` ends, and the query cache hands an answer on in a timer of 0.
 */
async function tick(ms: number): Promise<void> {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  for (let i = 0; i < 4; i++) await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
}

describe("the constants", () => {
  it("the settle is 300 ms and the shortest name is 2 characters", () => {
    expect(STAKEHOLDER_FIND_DEBOUNCE_MS).toBe(300);
    expect(STAKEHOLDER_FIND_MIN_CHARS).toBe(2);
  });
  it("the cached finds are all under one key prefix", () => {
    expect(STAKEHOLDER_FIND_KEY_PREFIX).toEqual(["gilb-stakeholders", "find"]);
  });
});

describe("the settle of typing (debounce)", () => {
  it("asks nothing before 300 ms, then asks once with the settled name, the reading and the vault", async () => {
    const h = mount({ displayName: "Ann" });
    await tick(299);
    expect(find).not.toHaveBeenCalled();
    await tick(1);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(READING, VAULT_ID, "Ann", undefined);
    expect(h.result.current.found.data?.candidates.map((c) => c.record)).toEqual([`${VNS}/e/a1`]);
  });

  it("a name typed again within the settle restarts it: only the last name is asked", async () => {
    const h = mount({ displayName: "An" });
    await tick(200);
    h.rerender(args({ displayName: "Ann" }));
    await tick(299);
    expect(find).not.toHaveBeenCalled();
    await tick(1);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0]![2]).toBe("Ann");
  });

  it("without a stakeholder kind, or with the dialog closed, nothing is asked and the settled name is dropped", async () => {
    const closed = mount({ displayName: "Ann", open: false });
    await tick(1000);
    expect(find).not.toHaveBeenCalled();
    closed.unmount();
    const folder = mount({ displayName: "Ann", option: { ...PERSON_OPTION, id: "folder", typeName: "folder" } });
    await tick(1000);
    expect(find).not.toHaveBeenCalled();
    expect(folder.result.current.stakeholderKind).toBeNull();
  });

  it("closing the dialog while the name is settling asks nothing", async () => {
    const h = mount({ displayName: "Ann" });
    await tick(100);
    h.rerender(args({ displayName: "Ann", open: false }));
    await tick(1000);
    expect(find).not.toHaveBeenCalled();
  });
});

describe("the shortest name", () => {
  it("one character is never asked; two are", async () => {
    const h = mount({ displayName: "A" });
    await tick(5000);
    expect(find).not.toHaveBeenCalled();
    h.rerender(args({ displayName: "An" }));
    await tick(300);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0]![2]).toBe("An");
  });

  it("a name emptied again is not asked and the list goes with it", async () => {
    const h = mount({ displayName: "Ann" });
    await tick(300);
    expect(h.result.current.found.data).toBeDefined();
    h.rerender(args({ displayName: "" }));
    await tick(300);
    expect(find).toHaveBeenCalledTimes(1);
    expect(h.result.current.found.data).toBeUndefined();
  });

  it("no vault chosen: nothing is asked", async () => {
    mount({ displayName: "Ann", vaultId: null });
    await tick(1000);
    expect(find).not.toHaveBeenCalled();
  });
});

describe("how long an answer is kept (staleTime 5 s, no retry)", () => {
  it("the same name asked again within 5 s is answered from the cache; after 5 s it is asked again", async () => {
    const h = mount({ displayName: "Ann" });
    await tick(300);
    h.rerender(args({ displayName: "Bob" }));
    await tick(300);
    expect(find.mock.calls.map((c) => c[2])).toEqual(["Ann", "Bob"]);
    h.rerender(args({ displayName: "Ann" }));
    await tick(300);
    expect(find.mock.calls.map((c) => c[2])).toEqual(["Ann", "Bob"]);
    await tick(5000);
    h.rerender(args({ displayName: "Bob" }));
    await tick(300);
    h.rerender(args({ displayName: "Ann" }));
    await tick(300);
    expect(find.mock.calls.map((c) => c[2])).toEqual(["Ann", "Bob", "Bob", "Ann"]);
  });

  it("the same name in another vault is another find: the answer of the first vault is not shown for the second", async () => {
    const other = "https://ben.platform.example.test/base";
    const h = mount({ displayName: "Ann", writable: [vault(VAULT_ID), vault(other)] });
    await tick(300);
    h.rerender(args({ displayName: "Ann", vaultId: other, writable: [vault(VAULT_ID), vault(other)] }));
    await tick(300);
    expect(find.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [VAULT_ID, "Ann"],
      [other, "Ann"],
    ]);
  });

  it("a find that fails is asked once, and the error is on the result", async () => {
    find.mockRejectedValue(new Error("the vault did not answer"));
    const h = mount({ displayName: "Ann" });
    await tick(300);
    await tick(60_000);
    expect(find).toHaveBeenCalledTimes(1);
    expect(h.result.current.found.error?.message).toBe("the vault did not answer");
  });

  it("refreshStakeholderFinds drops every cached find, and the active one is asked again", async () => {
    mount({ displayName: "Ann" });
    await tick(300);
    expect(find).toHaveBeenCalledTimes(1);
    await act(async () => {
      const done = refreshStakeholderFinds(qc);
      await vi.advanceTimersByTimeAsync(0);
      await done;
    });
    await tick(0);
    expect(find).toHaveBeenCalledTimes(2);
  });
});

describe("the source record is left out of the list", () => {
  const rows = [cand("src1", "Ann Lee"), cand("other", "Ann Leigh")];
  it("by its id, by the tail of an address given as the id, and by its address", async () => {
    find.mockResolvedValue(answer(...rows));
    const byId = mount({ displayName: "Ann", source: { id: "src1" } });
    await tick(300);
    expect(byId.result.current.found.data?.candidates.map((c) => c.record)).toEqual([`${VNS}/e/other`]);
    byId.unmount();
    qc.clear();
    qc = seededClient();
    const byTail = mount({ displayName: "Ann", source: { id: `${VNS}/e/src1` } });
    await tick(300);
    expect(byTail.result.current.found.data?.candidates.map((c) => c.record)).toEqual([`${VNS}/e/other`]);
    byTail.unmount();
    qc.clear();
    qc = seededClient();
    const byUri = mount({ displayName: "Ann", source: { entityUri: `${VNS}/e/src1` } });
    await tick(300);
    expect(byUri.result.current.found.data?.candidates.map((c) => c.record)).toEqual([`${VNS}/e/other`]);
  });

  it("with no source, the answer is handed on as it is (the same object)", async () => {
    const whole = answer(...rows);
    find.mockResolvedValue(whole);
    const h = mount({ displayName: "Ann", source: null });
    await tick(300);
    expect(h.result.current.found.data).toBe(whole);
  });
});

describe("the host", () => {
  it("a chosen vault that is not writable is corrected to the host's answer, given the writable list and the vault on screen", async () => {
    host.defaultWriteVaultId.mockReturnValue("v-next");
    mount({ vaultId: "v-gone", writable: [vault("v-a"), vault("v-b")], contentScope: { readVaultId: "v-b" } });
    await tick(0);
    expect(host.defaultWriteVaultId).toHaveBeenCalledWith([vault("v-a"), vault("v-b")], "v-b");
    expect(setVaultId).toHaveBeenCalledWith("v-next");
  });

  it("a writable choice is never moved, and an answer equal to the choice sets nothing", async () => {
    mount({ vaultId: VAULT_ID });
    await tick(0);
    expect(host.defaultWriteVaultId).not.toHaveBeenCalled();
    expect(setVaultId).not.toHaveBeenCalled();
    host.defaultWriteVaultId.mockReturnValue("v-gone");
    mount({ vaultId: "v-gone", writable: [vault("v-a")] });
    await tick(0);
    expect(setVaultId).not.toHaveBeenCalled();
  });

  it("the noun is the master's word for a stakeholder, from the vocabulary read through the host", async () => {
    const h = mount();
    await tick(0);
    expect(h.result.current.noun).toBe("Stakeholder");
    expect(host.vocabulary.masterKindReader).not.toHaveBeenCalled();
  });

  it("a vocabulary that is not in the cache is asked of the host's kind reader, and its refusal is the stand-in's detail", async () => {
    qc.clear();
    qc = seededClient(false);
    const h = mount({ mode: "plain" });
    await tick(0);
    expect(host.vocabulary.masterKindReader).toHaveBeenCalled();
    expect(h.result.current.kindsStandIn).toMatchObject({ status: "refused" });
  });
});

describe("createStakeholder: the guards before the package is asked", () => {
  it("a vault that is not writable is refused, with nothing asked of the host", async () => {
    const h = mount({ displayName: "Ann", vaultId: "v-gone" });
    await tick(0);
    await expect(h.result.current.createStakeholder()).rejects.toThrow(StakeholderCreateGuardError);
    await expect(h.result.current.createStakeholder()).rejects.toThrow("A stakeholder is made only in a vault you may write to.");
    expect(host.person.adderCardOf).not.toHaveBeenCalled();
  });

  it("no session is refused as not ready", async () => {
    const h = mount({ displayName: "Ann", session: null });
    await tick(0);
    await expect(h.result.current.createStakeholder()).rejects.toThrow("Not ready yet: not signed in, or the tag form is not read.");
    expect(host.person.adderCardOf).not.toHaveBeenCalled();
  });

  it("the gate is open only with the reading, the holder, a writable vault and a name", async () => {
    const open = mount({ displayName: "Ann" });
    await tick(0);
    expect(open.result.current.stakeholderGateOk).toBe(true);
    const noName = mount({ displayName: "" });
    await tick(0);
    expect(noName.result.current.stakeholderGateOk).toBe(false);
    const noSession = mount({ displayName: "Ann", session: null });
    await tick(0);
    expect(noSession.result.current.stakeholderGateOk).toBe(false);
  });
});
