/**
 * Ported from the app's vaultProfilePhoto.test.ts (10 of 15): FILE-FIELD via the stored Person link (the newest Person with a
 * photo is not the fill), the photo found the way every other app finds it, and photo BYTES fetched at the vault's own door.
 * Not ported (the functions are not in this unit): the three C9 save tests and the two C11 file-filter tests.
 *
 * Collaborators are faked: `readRecord` (lws-records) and `downloadFile` (file-download-outcome) are fake peers; this module is REAL.
 * The credential is the fake auth host (`setLwsAuth`); the origin is the setting. The app's `listVaultRecords` mock is gone: the
 * unit does not list a vault's people, which is what the tests below assert by what they never ask for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { downloadFile } from "@kaigilb/gilbplatformcode-file-download-outcome";
import { PROFILE_POINTER_ATTR, discoverVaultProfilePhoto, loadPhotoObjectUrl } from "./vaultProfilePhoto";
import { fakeHost, installLocalStorage, rec, setUp, tearDown } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-records")>()), readRecord: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-file-download-outcome", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-file-download-outcome")>()), downloadFile: vi.fn() }));

/** The stored photo spelling, as a LITERAL on purpose (importing the value under test would be a mirror). */
const PROFILE_PHOTO_ATTR = "profilePhoto";

const VAULT = "home-vault";
const VAULT_ENTITY_ID = "podentityaa";
const VAULT_ENTITY = `https://home.example.test/base/e/${VAULT_ENTITY_ID}`;
const PERSON_STORED = "personstored01";
const PERSON_NEWEST = "personnewest01";
const FILE_STORED = "filestoredphoto";
const FILE_NEWEST = "filenewestphoto";

beforeEach(() => {
  vi.clearAllMocks();
  installLocalStorage();
  setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("FILE-FIELD via the stored Person link: the newest Person with a photo is not the fill", () => {
  it("a miss of the stored Person link is a miss: the newest Person with a photo does not fill", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === VAULT_ENTITY_ID) return rec(VAULT_ENTITY_ID, {});
      if (id === PERSON_NEWEST) return rec(PERSON_NEWEST, { [PROFILE_PHOTO_ATTR]: `/files/${FILE_NEWEST}` });
      return rec(id, {});
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));

    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);
    expect(state.photoRef).toBeNull();
    expect(state.photoRef).not.toBe(`/files/${FILE_NEWEST}`);
  });

  it("a stored Person without a photo is a FILE-FIELD miss: not the newest other Person", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === VAULT_ENTITY_ID) return rec(VAULT_ENTITY_ID, { [PROFILE_POINTER_ATTR]: `https://home.example.test/base/e/${PERSON_STORED}` });
      if (id === PERSON_STORED) return rec(PERSON_STORED, {});
      if (id === PERSON_NEWEST) return rec(PERSON_NEWEST, { [PROFILE_PHOTO_ATTR]: `/files/${FILE_NEWEST}` });
      return rec(id, {});
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));

    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);
    expect(state.profileId).toBe(PERSON_STORED);
    expect(state.photoRef).toBeNull();
    expect(state.photoRef).not.toBe(`/files/${FILE_NEWEST}`);
  });

  it("the stored Person link is the face even when a newer Person has another photo", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === VAULT_ENTITY_ID) return rec(VAULT_ENTITY_ID, { [PROFILE_POINTER_ATTR]: `https://home.example.test/base/e/${PERSON_STORED}` });
      if (id === PERSON_STORED) return rec(PERSON_STORED, { [PROFILE_PHOTO_ATTR]: `/files/${FILE_STORED}` });
      if (id === PERSON_NEWEST) return rec(PERSON_NEWEST, { [PROFILE_PHOTO_ATTR]: `/files/${FILE_NEWEST}` });
      return rec(id, {});
    });

    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);
    expect(state.profileId).toBe(PERSON_STORED);
    expect(state.photoRef).toBe(`/files/${FILE_STORED}`);
    expect(state.photoRef).not.toBe(`/files/${FILE_NEWEST}`);
  });
});

describe("the photo is found the way every OTHER app finds it", () => {
  it("reads a photo written under the OTHER live spelling (hasPhoto)", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === VAULT_ENTITY_ID) return rec(VAULT_ENTITY_ID, { [PROFILE_POINTER_ATTR]: PERSON_STORED });
      if (id === PERSON_STORED) return rec(PERSON_STORED, { hasPhoto: `/files/${FILE_STORED}` });
      return rec(id, {});
    });
    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);
    expect(state.photoRef).toBe(`/files/${FILE_STORED}`);
  });

  it("falls back to the PRINCIPAL'S published card when the vault carries no pointer", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => rec(id, {}));
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ photoUrl: "/base/connect/profile-photo?principal=x" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);
    expect(state.photoRef).toBe("/base/connect/profile-photo?principal=x");
    // It asked about THIS vault, by identity, and picked the call by what it IS, not by its place in the list.
    const calls = fetchMock.mock.calls.map((c) => String(c[0] ?? ""));
    const cardCalls = calls.filter((u) => u.includes("/base/connect/public-card"));
    expect(cardCalls).toHaveLength(1);
    expect(cardCalls[0]).toContain(encodeURIComponent(VAULT));
    // And the fence that gives the claim its teeth: it never enumerated the vault's people.
    expect(calls.filter((u) => /[?&]type=Person\b/.test(u))).toHaveLength(0);
  });

  it("a non-person vault (404 not_a_person) still yields NO face: never an invented one", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => rec(id, {}));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);
    expect(state.photoRef).toBeNull();
  });

  it("STILL refuses another Person's face: a vault full of contacts must not adopt a contact's picture", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === PERSON_NEWEST) return rec(PERSON_NEWEST, { [PROFILE_PHOTO_ATTR]: `/files/${FILE_NEWEST}` });
      return rec(id, {});
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ photoUrl: null }), { status: 200 })));
    const state = await discoverVaultProfilePhoto(fakeHost(), VAULT_ENTITY, VAULT);
    expect(state.photoRef).toBeNull();
    expect(state.photoRef).not.toBe(`/files/${FILE_NEWEST}`);
  });
});

// The byte DOOR: discovery succeeded and the bytes 404'd, because a host-less ref was fetched at the apex, which holds no vault's files.
describe("photo BYTES are fetched at the vault's own door, never the apex", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:x");
  });
  it("passes the vault as the door for a host-less /files/<id>", async () => {
    vi.mocked(downloadFile).mockResolvedValue(new Blob(["x"]));
    await loadPhotoObjectUrl(`/files/${FILE_STORED}`, "https://danieltest.example.test/base");
    const [, at] = vi.mocked(downloadFile).mock.calls[0]!;
    expect(at).toBe("https://danieltest.example.test/base");
    expect(at).not.toBeNull();
  });

  it("still prefers a ref that carries its OWN host over the door", async () => {
    vi.mocked(downloadFile).mockResolvedValue(new Blob(["x"]));
    const owned = `https://otherpod.example.test/files/${FILE_STORED}`;
    await loadPhotoObjectUrl(owned, "https://danieltest.example.test/base");
    const [, at] = vi.mocked(downloadFile).mock.calls[0]!;
    expect(at).toBe(owned);
  });

  it("with no door and no host it still asks, but that is the apex, and the caller owes a door", async () => {
    vi.mocked(downloadFile).mockResolvedValue(null);
    const url = await loadPhotoObjectUrl(`/files/${FILE_STORED}`);
    const [, at] = vi.mocked(downloadFile).mock.calls[0]!;
    expect(at).toBeNull();
    expect(url).toBeNull();
  });
});
