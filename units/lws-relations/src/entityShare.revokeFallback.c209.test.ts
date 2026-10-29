// A vault holder who is not a deployment owner, and every Control holder,
// could make an item PUBLIC (the per-item share admits them) and could ⛔ not make it private: the
// W-FIELD PATCH needs a DATA write-grant and refuses them 403. W-FIELD stays the act; ONLY on that 403
// is the grant taken back through GilbPlatform `POST /base/authz/revoke-direct`, at the item's OWN vault.
//
// `revokeEntityShare` is REAL; `readRecord` / `patchRecord` / `listVaultRecordsPage` are collaborators.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { RecordForbiddenError, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { setUp, tearDown, type FakeHost } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, readRecord: vi.fn(), patchRecord: vi.fn() };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({ ...(await orig<Record<string, unknown>>()), listVaultRecordsPage: vi.fn(async () => ({})) }));

import { revokeEntityShare } from "./entityShare";
import { publicGrantee } from "./publicAccess";

const VAULT = "https://kaizen.platform.example.test/base";
const ID = "file-c209";
const FRAMED = `${VAULT}/e/${ID}`;
const HOLDER = "https://ann.platform.example.test/vault";

function rec(directReader: string): BaseRecord {
  return { id: ID, entityUri: FRAMED, typeUri: "t:File", facts: { name: "x.pdf", directReader }, opaqueFacts: [], etag: '"e"' } as BaseRecord;
}

let calls: Array<{ url: string; body: unknown }> = [];
let host: FakeHost;
beforeEach(() => {
  host = setUp();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('{"revoked":true}', { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(records.readRecord).mockReset();
  vi.mocked(records.patchRecord).mockReset();
  tearDown();
});

describe("C209 — revoke falls back to revoke-direct ONLY when W-FIELD is refused 403", () => {
  it("a 403 on the PATCH → POST <item's vault>/base/authz/revoke-direct {entity, principal}", async () => {
    vi.mocked(records.readRecord)
      .mockResolvedValueOnce(rec(`${HOLDER}, ${publicGrantee()}`))
      .mockResolvedValueOnce(rec(HOLDER));
    vi.mocked(records.patchRecord).mockRejectedValueOnce(new RecordForbiddenError("no current write-grant"));
    await revokeEntityShare(ID, publicGrantee(), VAULT, FRAMED);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://kaizen.platform.example.test/base/authz/revoke-direct");
    expect(calls[0]!.body).toEqual({ entity: FRAMED, principal: publicGrantee() });
  });

  it("when the PATCH succeeds, revoke-direct is NOT called — W-FIELD stays the act", async () => {
    vi.mocked(records.readRecord)
      .mockResolvedValueOnce(rec(`${HOLDER}, ${publicGrantee()}`))
      .mockResolvedValueOnce(rec(HOLDER));
    vi.mocked(records.patchRecord).mockResolvedValueOnce(undefined as never);
    await revokeEntityShare(ID, publicGrantee(), VAULT, FRAMED);
    expect(calls).toHaveLength(0);
  });

  it("any OTHER failure of the PATCH is thrown, ⛔ never silently re-routed", async () => {
    vi.mocked(records.readRecord).mockResolvedValueOnce(rec(`${HOLDER}, ${publicGrantee()}`));
    vi.mocked(records.patchRecord).mockRejectedValueOnce(new Error("network down"));
    await expect(revokeEntityShare(ID, publicGrantee(), VAULT, FRAMED)).rejects.toThrow(/network down/);
    expect(calls).toHaveLength(0);
  });
});
