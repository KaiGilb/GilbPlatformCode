/**
 * THE PER-ITEM GRANT IS ASKED OF THE VAULT THAT HOLDS THE ITEM, ⛔ a fixed apex.
 *
 * ── The defect, measured at the wire 2026-09-05 ───────────────────────────────────────
 * Ann clicked "Share for read" once. Base answered 403 with, verbatim:
 *
 *   Principal https://paraf.platform.example.test/base does not own the target vault
 *   https://id.platform.example.test/base — grant-direct requires vault ownership
 *
 * The `<vault>` in that sentence is `defaultVaultId(ownerHost)` — the deployment's HOME vault — not
 * the vault the entity in the same request NAMES (`https://childchild.platform.example.test/base/e/…`).
 * `grantDirect` posted to `${baseOrigin()}/base/authz/grant-direct`, and on production
 * `baseOrigin()` is the APEX, which the tunnel routes to ONE process bound to ONE store:
 *
 *     cloudflared names the system hosts  -> :8787 -> db `base`
 *     …then an INVERTED CATCH-ALL sends every other vault host -> :8789 -> db `base_vaults`
 *
 * (that topology is the C3 measurement of 2026-09-04, cited in
 * `crossVaultSearchNodeRouting.c161c3.test.tsx`; the F7 unit re-derived only that the apex IS the
 * home node — `GET https://platform.example.test/base/e/<id>` answers `No resource at
 * https://id.platform.example.test/base/e/<id>`.)
 *
 * So `resolveEntityVaultId` was asked, in the `base` store, about an entity whose datoms live in
 * `base_vaults`; it missed, folded the miss onto `defaultVaultId(ownerHost)` (`authz/vault.ts:133`),
 * and the owner gate refused the HOME vault. ⚠ The SUBJECT read was already moved to the vault door
 * in `8f20a1d` (the `door` parameter) and the REVOKE path already patches at the vault door — the
 * grant ACT was the one member of the share family still pinned to the apex.
 *
 * ── Why these arms discriminate (RuleBasetestFixtureDiscriminates) ────────────────────
 * The fixture's whole job is to make the record's own vault host DIFFER from `baseOrigin()`'s host.
 * A fixture whose record sits on the `baseOrigin()` host cannot tell the fixed origin from the
 * derived one — the two produce a byte-identical URL. `entityShare.wField.test.ts` is therefore
 * NOT coverage for this: it never reaches `grantDirect` at all.
 *
 * Arm 3 is the anti-over-correction trap: a record ALREADY on the `baseOrigin()` host must still
 * be asked at `baseOrigin()`, so "always rewrite the host" also fails this file.
 *
 * ── The mutation that reddens each arm (RuleBasetestMutationRedByName) ────────────────
 * Restore `const url = mode === "write" ? GRANT_WRITE_DIRECT_URL : GRANT_DIRECT_URL;` (the
 * module-level `${baseOrigin()}/…` constants) in `grantDirect` → arms 1, 2 and 4 go RED by name.
 *
 * `readRecord` / `patchRecord` mocked as collaborators; `shareEntity`, `grantDirectUrl`,
 * `toWireFacts` and `htuFor` are REAL (RuleBasetestMockedModuleNoInstrument).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setUp, tearDown, type FakeHost } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, readRecord: vi.fn(), patchRecord: vi.fn() };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vi.fn(async () => ({ items: [], total: 0 })),
}));

import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { shareEntity, grantDirectUrl } from "./entityShare";

/** Ann's vault — deliberately NOT the `baseOrigin()` host, which is what the apex bug hid. */
const VAULT = "https://childchild.platform.example.test/base";
const REC_ID = "yjq6rssaegz4";
const FRAMED = `${VAULT}/e/${REC_ID}`;
const GRANTEE = "https://cara.platform.example.test/base";

function rec(over: Partial<BaseRecord> = {}): BaseRecord {
  return {
    id: REC_ID,
    entityUri: FRAMED,
    typeUri: "https://platform.example.test/base/t/File",
    facts: { fileName: "CC_WHOLE3OF3.png" },
    opaqueFacts: [],
    etag: '"etag-f7"',
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let host: FakeHost;

beforeEach(() => {
  host = setUp();
  host.tokenManager.getSession.mockResolvedValue({ principal: "https://paraf.platform.example.test/base", vault: null, vaults: [] });
  vi.mocked(records.readRecord).mockResolvedValue(rec());
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 201,
    headers: new Headers(),
    json: async () => ({ granted: true }),
    text: async () => "{}",
  })) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  tearDown();
});

/** The grant POST among the calls the act made. */
function grantCall(): { url: string; body: Record<string, unknown> } {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/base/authz/grant"));
  if (!call) throw new Error("no grant-direct POST was made");
  return { url: String(call[0]), body: JSON.parse(String((call[1] as RequestInit).body)) };
}

describe("Cycle161 F7 — grant-direct is addressed at the vault that holds the entity", () => {
  it("F7-1 read-share POSTs to the RECORD'S OWN vault origin, not the apex baseOrigin()", async () => {
    await shareEntity(REC_ID, GRANTEE, "read", VAULT, VAULT);
    const { url } = grantCall();
    expect(url).toBe("https://childchild.platform.example.test/base/authz/grant-direct");
    expect(new URL(url).host).not.toBe(new URL(baseOrigin()).host);
  });

  it("F7-2 write-share POSTs grant-write-direct to that SAME vault origin", async () => {
    await shareEntity(REC_ID, GRANTEE, "write", VAULT, VAULT);
    const { url } = grantCall();
    expect(url).toBe("https://childchild.platform.example.test/base/authz/grant-write-direct");
  });

  it("F7-3 a record already on the baseOrigin() host is still asked at baseOrigin() (no over-correction)", () => {
    const apexEntity = `${baseOrigin()}/base/e/${REC_ID}`;
    expect(grantDirectUrl(apexEntity, "read")).toBe(`${baseOrigin()}/base/authz/grant-direct`);
    expect(grantDirectUrl(null, "read")).toBe(`${baseOrigin()}/base/authz/grant-direct`);
  });

  it("F7-4 the DPoP proof is asked for the VAULT's URL, so Base's Host-derived htu matches", async () => {
    // Re-pointed: the app's test measured its own `htuFor` on the URL; the proof here is built by the credential the host holds
    // (`signin`), so the unit's claim is that it asks the host to sign THAT URL, with the method of the request.
    await shareEntity(REC_ID, GRANTEE, "read", VAULT, VAULT);
    const { url } = grantCall();
    expect(host.dpopWriteAuth).toHaveBeenCalledWith("POST", url);
    expect(url).toBe("https://childchild.platform.example.test/base/authz/grant-direct");
  });

  it("F7-5 the URL host equals the host of the `entity` the same request names", async () => {
    await shareEntity(REC_ID, GRANTEE, "read", VAULT, VAULT);
    const { url, body } = grantCall();
    expect(new URL(String(body.entity)).host).toBe(new URL(url).host);
  });
});

/** Base's 4xx body shape (`server/app.ts::installErrorMapping`) — `{error, message}`. */
const SERVED_403 = JSON.stringify({
  error: "Forbidden",
  message:
    "Principal https://paraf.platform.example.test/base does not own the target vault " +
    "https://id.platform.example.test/base — grant-direct requires vault ownership (Cycle052 VDS-4; " +
    "per-object direct grants stay owner-scoped in VDS-6)",
});

// F7-6 to F7-8 of the app's file test `shareRefusalMessage` alone: they are in `share-refusal`, which holds that function.
describe("Cycle161 F7 — the server's own refusal sentence reaches the person (D-F3b / D-F3c)", () => {
  it("F7-9 shareEntity surfaces that same sentence to its caller", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: async () => SERVED_403,
      json: async () => JSON.parse(SERVED_403),
    } as unknown as Response);
    await expect(shareEntity(REC_ID, GRANTEE, "read", VAULT, VAULT)).rejects.toThrow(
      /does not own the target vault https:\/\/id\.platform\.example\.test\/base/,
    );
  });
});
