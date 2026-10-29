// What the ported tests leave unpinned: the export list, the constants, the shares of a reach, the type a record carries to its row,
// the mapping of a credential error through `names`, the page limit the reader hands the door, and the members of the doors.
import { describe, expect, it } from "vitest";
import type { ConnectionsReading } from "@kaigilb/gilbplatformcode-person-connections";
import * as api from "./index";
import {
  BUSY_DEFAULT_WAIT_MS,
  BUSY_RETRIES,
  FIRST_SCREEN_REQUESTS,
  LINKED_LOOKUP_CAP,
  LINK_READ_CONCURRENCY,
  NAME_READ_CONCURRENCY,
  RESOLVE_CONCURRENCY,
  STAKEHOLDER_LIST_REACH_CAP,
  createStakeholderListReader,
  entityKey,
  mergeStakeholderRows,
  pageLimitFor,
  pageLimitOfVault,
  reachShares,
  type StakeholderListDeps,
} from "./index";

const HOLDER = "https://holder.example.test/vault";
const ANN = "https://ann.example.test/vault";
const EMPTY: ConnectionsReading = { holder: HOLDER, vaultId: HOLDER, sets: [], people: [] };
const placed = (principal: string): ConnectionsReading => ({
  ...EMPTY,
  people: [{ principal, placements: [{ context: "personal", depth: "first-degree" }] }],
});

function deps(over: Partial<StakeholderListDeps> = {}): StakeholderListDeps {
  return {
    holder: HOLDER,
    vaults: [HOLDER],
    ownCardIds: [],
    async connections() {
      return EMPTY;
    },
    async listRecords() {
      return { records: [], next: null };
    },
    async readLink() {
      return { state: "none" };
    },
    async resolve() {
      return { kind: "none" };
    },
    async readName() {
      return { kind: "none" };
    },
    ...over,
  };
}

describe("the unit's export list", () => {
  it("is exactly these runtime names", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "BUSY_DEFAULT_WAIT_MS",
        "BUSY_RETRIES",
        "FIRST_SCREEN_REQUESTS",
        "LINKED_LOOKUP_CAP",
        "LINK_READ_CONCURRENCY",
        "NAME_READ_CONCURRENCY",
        "RESOLVE_CONCURRENCY",
        "STAKEHOLDER_LIST_REACH_CAP",
        "createStakeholderListReader",
        "entityKey",
        "mergeStakeholderRows",
        "pageLimitFor",
        "pageLimitOfVault",
        "readStakeholderList",
        "reachShares",
      ].sort(),
    );
  });

  it("the limits are these numbers", () => {
    expect({
      LINK_READ_CONCURRENCY,
      RESOLVE_CONCURRENCY,
      NAME_READ_CONCURRENCY,
      LINKED_LOOKUP_CAP,
      FIRST_SCREEN_REQUESTS,
      BUSY_RETRIES,
      BUSY_DEFAULT_WAIT_MS,
      STAKEHOLDER_LIST_REACH_CAP,
    }).toEqual({
      LINK_READ_CONCURRENCY: 3,
      RESOLVE_CONCURRENCY: 3,
      NAME_READ_CONCURRENCY: 3,
      LINKED_LOOKUP_CAP: 8,
      FIRST_SCREEN_REQUESTS: 40,
      BUSY_RETRIES: 2,
      BUSY_DEFAULT_WAIT_MS: 2000,
      STAKEHOLDER_LIST_REACH_CAP: 20,
    });
  });
});

describe("the shares of a reach", () => {
  it("3 vaults give 7, 7, 6; 1 gives 20; 0 or a negative count still gives at least 1", () => {
    expect([0, 1, 2].map((i) => pageLimitFor(i, 3))).toEqual([7, 7, 6]);
    expect(pageLimitFor(0, 1)).toBe(20);
    expect(pageLimitFor(0, 0)).toBe(20);
    expect(pageLimitFor(5, 40)).toBe(1);
  });

  it("a finished vault's share goes to the others, in held order; a vault not held is ignored", () => {
    const vaults = ["a", "b", "c"];
    expect([...reachShares(vaults, ["a", "b", "c"])]).toEqual([["a", 7], ["b", 7], ["c", 6]]);
    expect([...reachShares(vaults, ["c", "a"])]).toEqual([["a", 10], ["c", 10]]);
    expect([...reachShares(vaults, ["b"])]).toEqual([["b", 20]]);
    expect([...reachShares(vaults, ["zzz"])]).toEqual([]);
    expect([...reachShares(["a", "a", "b"], ["a", "b"])]).toEqual([["a", 10], ["b", 10]]);
  });

  it("pageLimitOfVault reads a vault not in the list as the first", () => {
    const limit = pageLimitOfVault(["a", "b", "c"]);
    expect([limit("a"), limit("b"), limit("c"), limit("zzz")]).toEqual([7, 7, 6, 7]);
  });

  it("the reader hands each door page its vault's share, 7 / 7 / 6 on the first draw", async () => {
    const asked: [string, number, number | undefined][] = [];
    const vaults = ["https://a.example.test/v", "https://b.example.test/v", "https://c.example.test/v"];
    const reader = createStakeholderListReader(
      deps({
        vaults,
        async listRecords(v, offset, limit) {
          asked.push([v, offset, limit]);
          return { records: [], next: null };
        },
      }),
    );
    await reader.read();
    expect(asked).toEqual([
      [vaults[0], 0, 7],
      [vaults[1], 0, 7],
      [vaults[2], 0, 6],
    ]);
  });
});

describe("the type a record carries to its row", () => {
  const rec = (id: string, type: string | null | undefined) => ({ recordId: `https://holder.example.test/vault/e/${id}`, vaultId: HOLDER, title: id, type, link: null });
  const self = { principal: HOLDER, cardIds: [] };

  it("is trimmed; a blank, a missing or a null type is null on the row", () => {
    const rows = mergeStakeholderRows({
      people: [],
      records: [rec("a", " t:Organization "), rec("b", "   "), rec("c", undefined), rec("d", null)],
      self,
      canonical: (p) => p,
    }).filter((r) => r.kind !== "self");
    expect(rows.map((r) => [r.title, r.recordType])).toEqual([["a", "t:Organization"], ["b", null], ["c", null], ["d", null]]);
  });

  it("never joins rows: the same type and the same title stay two rows", () => {
    const rows = mergeStakeholderRows({ people: [], records: [rec("a", "t:Person"), { ...rec("b", "t:Person"), title: "a" }], self, canonical: (p) => p }).filter(
      (r) => r.kind !== "self",
    );
    expect(rows).toHaveLength(2);
  });

  it("from the door's ListedRecord to the list's row", async () => {
    const reader = createStakeholderListReader(
      deps({
        async listRecords() {
          return { records: [{ recordId: `${HOLDER}/e/co`, title: "Acme", type: "t:Organization", link: { state: "none" } }], next: null };
        },
      }),
    );
    const list = await reader.read();
    expect(list.rows.find((r) => r.recordId === `${HOLDER}/e/co`)).toMatchObject({ kind: "record", title: "Acme", recordType: "t:Organization", linking: false });
  });
});

describe("entityKey, the key that names one entity in either address form", () => {
  it("gives the host and the id for both forms, and the trimmed string for anything else", () => {
    expect(entityKey("https://h.example.test/lws/r/abc")).toBe("https://h.example.test|abc");
    expect(entityKey(" https://h.example.test/vault/e/abc/ ")).toBe("https://h.example.test|abc");
    expect(entityKey("https://other.example.test/vault/e/abc")).toBe("https://other.example.test|abc");
    expect(entityKey("https://h.example.test/vault/e/abc?x=1")).toBe("https://h.example.test/vault/e/abc?x=1");
    expect(entityKey("https://h.example.test/a/b/c")).toBe("https://h.example.test/a/b/c");
    expect(entityKey(" not an address ")).toBe("not an address");
    expect(entityKey("https://h.example.test/lws/r/a%2Fb")).toBe("https://h.example.test|a/b");
    expect(entityKey("https://h.example.test/lws/r/%E0")).toBe("https://h.example.test|%E0");
  });
});

describe("a credential error on a name read", () => {
  const named = (name: string) => Object.assign(new Error(name), { name });
  const FIVE = ["NotSignedInError", "CredentialRefusedError", "CredentialExpiredError", "PublicCardViewerMismatchError", "OriginNotAllowedError"];

  async function keyOfAnn(readName: StakeholderListDeps["readName"]) {
    const reader = createStakeholderListReader(deps({ connections: async () => placed(ANN), readName }));
    const list = await reader.read();
    const row = list.rows.find((r) => r.principal === ANN)!;
    return { reader, key: row.key };
  }

  it.each(FIVE)("%s makes names() reject with that same error, and the next ask reads again", async (name) => {
    let calls = 0;
    const err = named(name);
    const { reader, key } = await keyOfAnn(async () => {
      calls++;
      if (calls === 1) throw err;
      return { kind: "name", name: "Ann" };
    });
    await expect(reader.names([key])).rejects.toBe(err);
    expect((await reader.names([key])).get(key)).toEqual({ state: "name", name: "Ann" });
    expect(calls).toBe(2);
  });

  it.each(["NotAPersonError", "PublicCardError", "ContactCardReachError", "notsignedinerror", " NotSignedInError", "AbortError", ""])(
    "%j is not one of the five: that row is unavailable, asked again next time",
    async (name) => {
      let calls = 0;
      const { reader, key } = await keyOfAnn(async () => {
        calls++;
        throw named(name);
      });
      expect((await reader.names([key])).get(key)).toEqual({ state: "unavailable" });
      await reader.names([key]);
      expect(calls).toBe(2);
    },
  );

  it("a thrown string, null or an object without a name is unavailable", async () => {
    for (const thrown of ["NotSignedInError", null, undefined, {}, { name: 401 }]) {
      const { reader, key } = await keyOfAnn(async () => {
        throw thrown;
      });
      expect((await reader.names([key])).get(key)).toEqual({ state: "unavailable" });
    }
  });
});

describe("the doors the reader calls", () => {
  it("never calls an optional door that is missing: linkedRecordIds, linkedRecordsOf, requestsSoFar, canonical, selfName", async () => {
    const calls: string[] = [];
    const reader = createStakeholderListReader({
      holder: HOLDER,
      vaults: [HOLDER],
      ownCardIds: [],
      connections: async () => placed(ANN),
      listRecords: async () => ({ records: [{ recordId: `${HOLDER}/e/r`, title: "r", link: { state: "linked", target: ANN } }], next: null }),
      readLink: async () => {
        calls.push("readLink");
        return { state: "none" };
      },
      resolve: async () => {
        calls.push("resolve");
        return { kind: "person", principal: ANN, entity: `${ANN}/e/card` };
      },
      readName: async () => {
        calls.push("readName");
        return { kind: "none" };
      },
    });
    const list = await reader.read();
    expect(list.rows.map((r) => r.kind)).toEqual(["self", "both"]);
    expect(list.spellings).toEqual({ state: "not-needed" });
    expect(calls).toEqual(["resolve"]);
  });

  it("a connections answer for another vault is a failure, never 'no circles'", async () => {
    const list = await createStakeholderListReader(deps({ holderVault: HOLDER, connections: async () => ({ ...EMPTY, vaultId: "https://other.example.test/vault" }) })).read();
    expect(list.connections.state).toBe("failed");
    expect(list.partial).toBe(true);
  });
});
