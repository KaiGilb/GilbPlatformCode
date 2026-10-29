// Two devices (or two tabs: the remove path holds no lock) end the SAME tie at once. Measured on a rig: the platform answers the second
// POST …/end with 500 ("CAS conflict … concurrent write detected"), although the tie IS ended. Ending is idempotent, so an ending the vault refused,
// whose read-back shows the tie no longer live, is DONE, not "Could not remove this".
// The app's mocks of its DPoP and token modules are the fake auth host of `test/support.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const docs = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-relations", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-relations")>()), readRelationDoc: docs.read }));
import { setUp, tearDown } from "../test/support";
import { endKindRelations } from "./kindRelation";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

const VNS = "https://ann.platform.example.test/base";
describe("a concurrent end of the same tie", () => {
  it("an end the vault refused with 500 (CAS conflict) while the tie reads back ENDED is done, not an error (idempotent end)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 500, ok: false, text: async () => '{"error":"InternalServerError"}', json: async () => ({}), headers: { get: (): string | null => null } })));
    docs.read.mockResolvedValue({ uri: `${VNS}/r/abc123`, sourceUri: null, targetUri: null, typeCurie: "t:FriendOf", extras: {} });
    await expect(endKindRelations(VNS, [`${VNS}/r/abc123`])).resolves.toBeUndefined();
  });
  it("a refused end whose tie is still LIVE stays an error (the guard is kept)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 500, ok: false, text: async () => "boom", json: async () => ({}), headers: { get: (): string | null => null } })));
    docs.read.mockResolvedValue({ uri: `${VNS}/r/abc123`, sourceUri: `${VNS}/e/ben`, targetUri: `${VNS}/e/v`, typeCurie: "t:FriendOf", extras: {} });
    await expect(endKindRelations(VNS, [`${VNS}/r/abc123`])).rejects.toThrow();
  });
});
