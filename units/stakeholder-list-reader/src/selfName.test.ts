// The self row's name, photo and caption come from `selfName`, with no request.
import { describe, expect, it } from "vitest";
import {
  createStakeholderListReader,
  type NameAnswer,
  type StakeholderListDeps,
} from "./index";

const CORA = "https://holder.example.test/vault";
const WALT = "https://walt.example.test/vault";

describe("selfName only for an asked self key", () => {
  it("names([walt]) neither calls selfName nor answers the self key; names([self]) does, with 0 door reads", async () => {
    let selfCalls = 0;
    const reads: string[] = [];
    const deps: StakeholderListDeps = {
      holder: CORA,
      vaults: [CORA],
      ownCardIds: [`${CORA}/e/self`],
      connections: async () => ({ holder: CORA, vaultId: CORA, sets: [], people: [{ principal: WALT, placements: [{ context: "personal", depth: "first-degree" }] }] }),
      listRecords: async () => ({ records: [{ recordId: `${CORA}/e/self`, title: "Cora Hale", link: { state: "none" } }], next: null }),
      readLink: async () => ({ state: "none" }),
      resolve: async () => ({ kind: "none" }),
      readName: async (p: string): Promise<NameAnswer> => (reads.push(p), { kind: "name", name: "Walt" }),
      selfName: () => (selfCalls++, { kind: "name", name: "Cora", photoUrl: "p", caption: "Hale AS" }),
    };
    const reader = createStakeholderListReader(deps);
    const list = await reader.read();
    const self = list.rows.find((r) => r.kind === "self")!;
    const walt = list.rows.find((r) => r.kind === "placed")!;
    const a = await reader.names([walt.key]);
    expect([...a.keys()]).toEqual([walt.key]);
    expect(selfCalls).toBe(0);
    const b = await reader.names([self.key]);
    expect(b.get(self.key)).toEqual({ state: "name", name: "Cora", photoUrl: "p", caption: "Hale AS" });
    expect(selfCalls).toBe(1);
    expect(reads).toEqual([WALT]);
  });
});
