// A name read may carry a photo address and a caption; the list keeps them only when the door gave them.
import { describe, expect, it } from "vitest";
import {
  createStakeholderListReader,
  type NameAnswer,
  type RecordsPage,
  type StakeholderListDeps,
} from "./index";
import {
  type AtomicPlacement,
  type ConnectionsReading,
} from "@kaigilb/gilbplatformcode-person-connections";

const PP: AtomicPlacement = { context: "personal", depth: "first-degree" };
const CORA = "https://holder.example.test/vault";
const who = (n: string): string => `https://${n}.example.test/vault`;

/** A holder with three placed people and no records; every door counts its calls. */
function world(answers: Map<string, NameAnswer>) {
  const calls = { connections: 0, listRecords: 0, linkedRecordIds: 0, readLink: 0, resolve: 0, readName: 0 };
  const deps: StakeholderListDeps = {
    holder: CORA,
    vaults: [CORA],
    ownCardIds: [`${CORA}/e/vsc-cora`],
    async connections(): Promise<ConnectionsReading> {
      calls.connections++;
      return { holder: CORA, vaultId: CORA, sets: [], people: [...answers.keys()].map((principal) => ({ principal, placements: [PP] })) };
    },
    async listRecords(): Promise<RecordsPage> {
      calls.listRecords++;
      return { records: [], next: null };
    },
    async linkedRecordIds() {
      calls.linkedRecordIds++;
      return [];
    },
    async readLink() {
      calls.readLink++;
      return { state: "none" };
    },
    async resolve() {
      calls.resolve++;
      return { kind: "none" };
    },
    async readName(principal: string): Promise<NameAnswer> {
      calls.readName++;
      return answers.get(principal) ?? { kind: "none" };
    },
  };
  const total = () => Object.values(calls).reduce((a, b) => a + b, 0);
  return { deps, calls, total };
}

describe("createStakeholderListReader", () => {
  describe("names: photo address and caption from the same name read", () => {
    it("keeps the photo address and caption the name door answers, with the name", async () => {
      const walt = who("walt");
      const { deps } = world(
        new Map<string, NameAnswer>([[walt, { kind: "name", name: "Walt Hale", photoUrl: "/base/connect/photo?principal=walt", caption: "Acme Planning Ltd" }]]),
      );
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const names = await reader.names([walt]);
      expect(names.get(walt)).toStrictEqual({ state: "name", name: "Walt Hale", photoUrl: "/base/connect/photo?principal=walt", caption: "Acme Planning Ltd" });
    });

    it("costs 0 extra requests: one name read per person, and none at all when asked again", async () => {
      const walt = who("walt");
      const eli = who("eli");
      const finn = who("finn");
      const { deps, calls, total } = world(
        new Map<string, NameAnswer>([
          [walt, { kind: "name", name: "Walt Hale", photoUrl: "/p/walt", caption: "Acme Planning Ltd" }],
          [eli, { kind: "name", name: "Eli", photoUrl: null, caption: null }],
          [finn, { kind: "name", name: "Finn" }],
        ]),
      );
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const beforeNames = total();
      const first = await reader.names([walt, eli, finn]);
      // Exactly the three name reads the list made before this step: no photo read, no card read, nothing else.
      expect(total() - beforeNames).toBe(3);
      expect(calls.readName).toBe(3);
      const again = await reader.names([walt, eli, finn]);
      expect(total() - beforeNames).toBe(3);
      expect(again.get(walt)).toStrictEqual(first.get(walt));
      expect(again.get(walt)).toStrictEqual({ state: "name", name: "Walt Hale", photoUrl: "/p/walt", caption: "Acme Planning Ltd" });
    });

    it("an answer without them keeps today's shape exactly (no new keys), and null stays null", async () => {
      const eli = who("eli");
      const finn = who("finn");
      const { deps } = world(
        new Map<string, NameAnswer>([
          [eli, { kind: "name", name: "Eli", photoUrl: null, caption: null }],
          [finn, { kind: "name", name: "Finn" }],
        ]),
      );
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const names = await reader.names([eli, finn]);
      expect(names.get(finn)).toStrictEqual({ state: "name", name: "Finn" });
      expect(Object.keys(names.get(finn)!)).toEqual(["state", "name"]);
      expect(names.get(eli)).toStrictEqual({ state: "name", name: "Eli", photoUrl: null, caption: null });
    });

    it("a card that shows this viewer no name may still carry a photo address", async () => {
      const gus = who("gus");
      const { deps } = world(new Map<string, NameAnswer>([[gus, { kind: "name", name: null, photoUrl: "/p/gus" }]]));
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const names = await reader.names([gus]);
      expect(names.get(gus)).toStrictEqual({ state: "name", name: null, photoUrl: "/p/gus" });
    });
  });
});
