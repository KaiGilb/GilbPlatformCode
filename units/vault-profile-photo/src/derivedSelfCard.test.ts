/**
 * Ported from the app's vaultProfilePhoto.derivedSelfCard.c186.test.ts (6 of 6): the photo must survive a CLEAN RELOAD, which is the
 * case every other road misses. The fixture gives discovery nothing but the vault root: no pointer fact, no localStorage, and the
 * cross-app lookup left to fail. If the derived road is removed, there is no other way to the card and these tests go red.
 *
 * Changes: the vault is an `example.test` vault, so the derived card id is the sha256 of ITS root made with `shasum -a 256`
 * (`printf %s https://aitester.example.test/vault | shasum -a 256`, first 24 hex), a literal and not computed by the test; the
 * app's mocks of the credential, files, vault sets and records are the fake auth host and a fake `readRecord` peer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { discoverVaultProfilePhoto } from "./vaultProfilePhoto";
import { fakeHost, installLocalStorage, setUp, tearDown } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-records")>()), readRecord: vi.fn() }));

const VAULT = "https://aitester.example.test/vault";
const VAULT_ENTITY = "https://aitester.example.test/vault/e/vault-entity-1";
const DERIVED_CARD_ID = "vsc-7616baed046a5d59810672e5";
const DERIVED_CARD_URI = `${VAULT}/e/${DERIVED_CARD_ID}`;
const LIVE_PHOTO_REF = "/files/xc1sgm0mcqpb";

/** The production shape: the vault record exists and names NO self-card. */
const VAULT_RECORD_WITHOUT_POINTER = {
  id: "vault-entity-1",
  facts: { isVault: "true", name: "aitester", vaultAddress: "aitester.example.test", vaultId: VAULT },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  installLocalStorage();
  setUp();
  // Every network road other than the card read itself answers "nothing here".
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("a clean reload finds the photo with no pointer and no cache", () => {
  it("1. resolves the photo from the DERIVED self-card address alone", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === "vault-entity-1") return VAULT_RECORD_WITHOUT_POINTER;
      if (id === DERIVED_CARD_ID) return { id: DERIVED_CARD_ID, facts: { profilePhoto: LIVE_PHOTO_REF } } as never;
      return null;
    });

    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);

    expect(state.photoRef).toBe(LIVE_PHOTO_REF);
    expect(state.profileId).toBe(DERIVED_CARD_ID);
  });

  it("2. addresses the card AT ITS OWN VAULT, not a default origin", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === "vault-entity-1") return VAULT_RECORD_WITHOUT_POINTER;
      if (id === DERIVED_CARD_ID) return { id: DERIVED_CARD_ID, facts: { profilePhoto: LIVE_PHOTO_REF } } as never;
      return null;
    });

    await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);

    const call = vi.mocked(readRecord).mock.calls.find((c) => c[0] === DERIVED_CARD_ID);
    expect(call, "the derived card was never read").toBeDefined();
    expect(call![1]).toBe(DERIVED_CARD_URI);
  });

  it("3. a card that EXISTS with an empty photo field is not reported as a photo", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === "vault-entity-1") return VAULT_RECORD_WITHOUT_POINTER;
      if (id === DERIVED_CARD_ID) return { id: DERIVED_CARD_ID, facts: { name: "Ai Tester" } } as never;
      return null;
    });

    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);
    expect(state.photoRef).toBeNull();
    // The name is the self card's, not the vault record's "aitester".
    expect(state.personName).toBe("Ai Tester");
  });

  it("6. one read of the derived card returns its photo and its person name", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === "vault-entity-1") return VAULT_RECORD_WITHOUT_POINTER;
      if (id === DERIVED_CARD_ID) return { id: DERIVED_CARD_ID, facts: { profilePhoto: LIVE_PHOTO_REF, name: "Ann Example" } } as never;
      return null;
    });

    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);

    expect(state.photoRef).toBe(LIVE_PHOTO_REF);
    expect(state.personName).toBe("Ann Example");
    expect(vi.mocked(readRecord).mock.calls.filter((c) => c[0] === DERIVED_CARD_ID)).toHaveLength(1);
  });

  it("4. a read failure is not turned into 'there is no photo': it must not throw", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === "vault-entity-1") return VAULT_RECORD_WITHOUT_POINTER;
      throw new Error("network down");
    });

    await expect(discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT)).resolves.toBeDefined();
  });

  it("5. a DIFFERENT vault does not resolve this vault's card: the address is per-vault", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === DERIVED_CARD_ID) return { id: DERIVED_CARD_ID, facts: { profilePhoto: LIVE_PHOTO_REF } } as never;
      return null;
    });

    const other = await discoverVaultProfilePhoto(fakeHost(), "https://lottelise.example.test/vault/e/vault-entity-9", "https://lottelise.example.test/vault");
    expect(other.photoRef).toBeNull();
  });
});
