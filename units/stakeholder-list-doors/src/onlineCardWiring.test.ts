// The online-card controller's wiring does the controller's I/O with the platform's own doors and nothing else: constructing the
// dependencies requests nothing; the platform is the identity node and every request carries the DPoP proof; the link is written by a merge
// patch of the holder's own record carrying only the link's patch. `patchRecord` is the `lws-records` peer, so it is replaced here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchRecord = vi.hoisted(() => vi.fn(async () => ({ etag: null })));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...((await orig()) as object), patchRecord }));

import { onlineCardDeps } from "./onlineCardWiring";
import { ORIGIN, setUp, tearDown } from "../test/support";

const RECORD = { id: "rec1", entityUri: "https://h.platform.example.test/vault/e/rec1" };
const VAULT = "https://h.platform.example.test/vault";
const HOLDER = "https://id.platform.example.test/base/p/holder-principal"; // the signed-in holder is NOT the vault: a write that named the holder as the vault must fail
const deps = () => onlineCardDeps({ record: RECORD, vaultId: VAULT, holder: HOLDER, canWrite: true, link: { state: "none" }, onLinkChanged: undefined });

let auth: ReturnType<typeof setUp>;
beforeEach(() => {
  auth = setUp();
  auth.dpopReadAuth.mockResolvedValue({ authorization: "DPoP t", dpop: "p" });
  patchRecord.mockClear();
});
afterEach(() => {
  tearDown();
  vi.unstubAllGlobals();
});

describe("onlineCardDeps", () => {
  it("constructing the dependencies requests nothing", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    deps();
    expect(f).not.toHaveBeenCalled();
    expect(auth.dpopReadAuth).not.toHaveBeenCalled();
  });
  it("the platform the controller reads is the identity node, and every request it makes carries the DPoP proof", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: init?.headers as Record<string, string> });
      return new Response("{}", { status: 404 });
    });
    const platform = deps().platform;
    expect(platform.origin).toBe(ORIGIN);
    await platform.fetch(`${ORIGIN}/base/connect/public-card?principal=x`, { method: "GET" });
    expect(seen.length).toBe(1);
    expect(seen[0]!.headers).toMatchObject({ authorization: "DPoP t", dpop: "p" });
  });
  it("writeLink is a merge patch of the holder's own record carrying ONLY the link's patch", async () => {
    await deps().writeLink({ record: RECORD.entityUri, patch: { sameAs: { "@id": "https://k.platform.example.test/vault" } } });
    expect(patchRecord).toHaveBeenCalledTimes(1);
    expect(patchRecord).toHaveBeenCalledWith("rec1", { sameAs: { "@id": "https://k.platform.example.test/vault" } }, RECORD.entityUri);
    await deps().writeLink({ record: RECORD.entityUri, patch: { sameAs: null } });
    expect(patchRecord).toHaveBeenLastCalledWith("rec1", { sameAs: null }, RECORD.entityUri);
  });
  it("the dependencies carry no copy path", () => {
    const d = deps() as unknown as Record<string, unknown>;
    for (const gone of ["listUsed", "heldSpellings", "isReference", "createUsed", "deleteUsed"]) expect(d[gone], gone).toBeUndefined();
  });
});
