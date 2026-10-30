// What the unit asks of its host and settings, and the paths of the three functions the ported tests leave unpinned. Added tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { downloadFile } from "@kaigilb/gilbplatformcode-file-download-outcome";
import { PROFILE_POINTER_ATTR, discoverVaultProfilePhoto, loadPhotoObjectUrl, peekCachedProfilePhoto, vaultRootOf } from "./vaultProfilePhoto";
import { fakeHost, installLocalStorage, rec, setUp, tearDown, type FakeAuth } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-records")>()), readRecord: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-file-download-outcome", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-file-download-outcome")>()), downloadFile: vi.fn() }));

const VAULT = "https://ann.platform.example.test/vault";
const ENTITY_ID = "vaultentity01";
const ENTITY = `${VAULT}/e/${ENTITY_ID}`;
const PERSON = "personrecord01";
const PERSON_URI = `${VAULT}/e/${PERSON}`;

let auth: FakeAuth;
let store: Map<string, string>;
beforeEach(() => {
  vi.clearAllMocks();
  store = installLocalStorage();
  auth = setUp();
  URL.createObjectURL = vi.fn(() => "blob:made");
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

/** Reads: the vault entity points at PERSON, which carries `facts`. */
function pointed(facts: Record<string, string>) {
  vi.mocked(readRecord).mockImplementation(async (id: string) => {
    if (id === ENTITY_ID) return rec(ENTITY_ID, { [PROFILE_POINTER_ATTR]: PERSON_URI }, ENTITY);
    if (id === PERSON) return rec(PERSON, facts, PERSON_URI);
    return null;
  });
}
const noNetwork = () => vi.stubGlobal("fetch", vi.fn(async (_u: string, _i?: RequestInit) => new Response("{}", { status: 404 })));

describe("the host: photoReadKeys", () => {
  it("is asked once per discovery, before the first record is read", async () => {
    const order: string[] = [];
    const host = fakeHost();
    host.photoReadKeys.mockImplementation(async () => {
      order.push("keys");
      return ["profilePhoto"];
    });
    vi.mocked(readRecord).mockImplementation(async () => {
      order.push("read");
      return null;
    });
    noNetwork();
    await discoverVaultProfilePhoto(host, ENTITY, VAULT);
    expect(host.photoReadKeys).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("keys");
  });
  it("is asked even when no vault entity is given", async () => {
    const host = fakeHost();
    vi.mocked(readRecord).mockResolvedValue(null);
    noNetwork();
    await discoverVaultProfilePhoto(host, null, null);
    expect(host.photoReadKeys).toHaveBeenCalledTimes(1);
  });
  it("what it answers decides the spelling that is read", async () => {
    pointed({ myPhotoSpelling: "/files/filespelled01" });
    expect((await discoverVaultProfilePhoto(fakeHost(["myPhotoSpelling"]), ENTITY, VAULT)).photoRef).toBe("/files/filespelled01");
    noNetwork();
    expect((await discoverVaultProfilePhoto(fakeHost(["profilePhoto"]), ENTITY, "other-vault-key")).photoRef).toBeNull();
  });
  it("a rejection is not swallowed: the discovery rejects", async () => {
    const host = fakeHost();
    host.photoReadKeys.mockRejectedValue(new Error("term down"));
    await expect(discoverVaultProfilePhoto(host, ENTITY, VAULT)).rejects.toThrow("term down");
  });
});

describe("the host: noteVaultPicture (optional)", () => {
  it("is told true when the pointer road finds a photo", async () => {
    pointed({ profilePhoto: "/files/filefound0001" });
    const host = fakeHost();
    await discoverVaultProfilePhoto(host, ENTITY, VAULT);
    expect(host.noted).toEqual([[VAULT, true]]);
  });
  it("is told true when the cross-app road finds a photo", async () => {
    vi.mocked(readRecord).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ photoUrl: "/base/connect/profile-photo?principal=p" }), { status: 200 })));
    const host = fakeHost();
    await discoverVaultProfilePhoto(host, ENTITY, VAULT);
    expect(host.noted).toEqual([[VAULT, true]]);
  });
  it("is told false when nothing is found", async () => {
    vi.mocked(readRecord).mockResolvedValue(null);
    noNetwork();
    const host = fakeHost();
    await discoverVaultProfilePhoto(host, ENTITY, VAULT);
    expect(host.noted).toEqual([[VAULT, false]]);
  });
  it("is not told anything when no vault id is given", async () => {
    vi.mocked(readRecord).mockResolvedValue(null);
    noNetwork();
    const host = fakeHost();
    await discoverVaultProfilePhoto(host, ENTITY, null);
    expect(host.noted).toEqual([]);
  });
  it("an absent member is fine: nothing is noted and nothing throws", async () => {
    pointed({ profilePhoto: "/files/filefound0001" });
    const host = { photoReadKeys: async () => ["profilePhoto"] as readonly string[] };
    await expect(discoverVaultProfilePhoto(host, ENTITY, VAULT)).resolves.toMatchObject({ photoRef: "/files/filefound0001" });
  });
});

describe("what discovery keeps", () => {
  it("a found photo is kept under the vault id and its entity-id tail, and the pointer under the entity id", async () => {
    pointed({ profilePhoto: "https://x.example.test/files/filefound0001" });
    const state = await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT);
    expect(state).toEqual({ profileId: PERSON, photoRef: "/files/filefound0001", personName: null });
    expect(store.get(`mnb.profilePhotoRef.${VAULT}`)).toBe("/files/filefound0001");
    expect(store.get(`mnb.profilePhotoRef.${ENTITY_ID}`)).toBe("/files/filefound0001");
    expect(store.get(`mnb.profilePhotoRef.${ENTITY}`)).toBe("/files/filefound0001");
    expect(store.get(`mnb.profilePointer.${ENTITY_ID}`)).toBe(PERSON);
    expect(peekCachedProfilePhoto(VAULT, ENTITY)).toBe("/files/filefound0001");
  });
  it("a miss drops the kept photo, so another face is never shown", async () => {
    pointed({ profilePhoto: "/files/filefound0001" });
    await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT);
    expect(peekCachedProfilePhoto(VAULT, ENTITY)).toBe("/files/filefound0001");
    vi.mocked(readRecord).mockResolvedValue(null);
    noNetwork();
    store.delete(`mnb.profilePointer.${ENTITY_ID}`);
    await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT);
    expect(peekCachedProfilePhoto(VAULT, ENTITY)).toBeNull();
    expect([...store.keys()].filter((k) => k.startsWith("mnb.profilePhotoRef."))).toEqual([]);
  });
  it("the pointer kept on this device is followed when the vault carries none", async () => {
    store.set(`mnb.profilePointer.${ENTITY_ID}`, PERSON);
    vi.mocked(readRecord).mockImplementation(async (id: string) => (id === PERSON ? rec(PERSON, { profilePhoto: "/files/filelocal0001", name: "  Ann Example " }, PERSON_URI) : null));
    const state = await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT);
    expect(state).toEqual({ profileId: PERSON, photoRef: "/files/filelocal0001", personName: "Ann Example" });
  });
  it("a pointer that names the vault entity itself, or an empty tail, is skipped", async () => {
    vi.mocked(readRecord).mockImplementation(async (id: string) => (id === ENTITY_ID ? rec(ENTITY_ID, { [PROFILE_POINTER_ATTR]: ENTITY }, ENTITY) : null));
    noNetwork();
    const state = await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT);
    expect(state.profileId).toBeNull();
    expect(vi.mocked(readRecord).mock.calls.filter((c) => c[0] === ENTITY_ID)).toHaveLength(1);
  });
  it("a stale pointer (the read throws) is passed over and the next candidate is tried", async () => {
    store.set(`mnb.profilePointer.${ENTITY_ID}`, PERSON);
    vi.mocked(readRecord).mockImplementation(async (id: string) => {
      if (id === ENTITY_ID) return rec(ENTITY_ID, { [PROFILE_POINTER_ATTR]: "stalepointer01" }, ENTITY);
      if (id === "stalepointer01") throw new Error("gone");
      if (id === PERSON) return rec(PERSON, { profilePhoto: "/files/filelocal0001" }, PERSON_URI);
      return null;
    });
    expect((await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT)).photoRef).toBe("/files/filelocal0001");
  });
  it("a card with no photo keeps the profile id and the name as found", async () => {
    pointed({ name: "Ann Example" });
    noNetwork();
    expect(await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT)).toEqual({ profileId: PERSON, photoRef: null, personName: "Ann Example" });
  });
  it("with no vault id the roads that need it are not taken, and nothing is kept", async () => {
    pointed({ profilePhoto: "/files/filefound0001" });
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const state = await discoverVaultProfilePhoto(fakeHost(), ENTITY, null);
    expect(state.photoRef).toBe("/files/filefound0001");
    expect(f).not.toHaveBeenCalled();
    expect([...store.keys()].filter((k) => k.startsWith("mnb.profilePhotoRef."))).toEqual([]);
  });
  it("peekCachedProfilePhoto reads what this device kept, normalised, and remembers it", () => {
    store.set("mnb.profilePhotoRef.vault-on-device", "https://h.example.test/vault/e/filedevice001");
    expect(peekCachedProfilePhoto("vault-on-device")).toBe("/files/filedevice001");
    store.clear();
    expect(peekCachedProfilePhoto("vault-on-device")).toBe("/files/filedevice001");
    expect(peekCachedProfilePhoto("never-seen")).toBeNull();
  });
  it("peekCachedProfilePhoto ignores a kept value that names no file", () => {
    store.set("mnb.profilePhotoRef.vault-junk", "/base/connect/profile-photo?principal=x");
    expect(peekCachedProfilePhoto("vault-junk")).toBeNull();
  });
});

describe("the false friend, in the discovery", () => {
  it("a vault address with a malformed percent-encoding rejects the discovery (the app's entityIdTail throws outside any try)", async () => {
    vi.mocked(readRecord).mockResolvedValue(null);
    noNetwork();
    await expect(discoverVaultProfilePhoto(fakeHost(), "https://ann.platform.example.test/vault/e/%E0%A4%A", VAULT)).rejects.toThrow(URIError);
  });
  it("loadPhotoObjectUrl rejects on the same malformed reference too (its parse is outside the try)", async () => {
    await expect(loadPhotoObjectUrl("https://h.example.test/vault/e/%E0%A4%A")).rejects.toThrow(URIError);
  });
});

describe("the origin is read from the setting when the function runs", () => {
  it("the published-card road is built on the origin that was set, with the credential for that very url", async () => {
    vi.mocked(readRecord).mockResolvedValue(null);
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", f);
    await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT);
    const url = `https://platform.example.test/base/connect/public-card?principal=${encodeURIComponent(VAULT)}`;
    expect(f.mock.calls[0]![0]).toBe(url);
    expect(f.mock.calls[0]![1]).toEqual({ headers: { authorization: "DPoP t", dpop: "p" } });
    expect(auth.dpopReadAuth).toHaveBeenCalledWith("GET", url);
    setBaseOrigin("https://moved.example.test");
    f.mockClear();
    await discoverVaultProfilePhoto(fakeHost(), ENTITY, VAULT);
    expect(String(f.mock.calls[0]![0]).startsWith("https://moved.example.test/base/connect/public-card?")).toBe(true);
  });
  it("a mediated photo is fetched at the platform origin with the credential, and a host-less one is resolved against the origin", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(new Blob(["b"]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await loadPhotoObjectUrl("/base/connect/profile-photo?principal=abc")).toBe("blob:made");
    expect(f.mock.calls[0]![0]).toBe("https://platform.example.test/base/connect/profile-photo?principal=abc");
    expect(f.mock.calls[0]![1]).toEqual({ headers: { authorization: "DPoP t", dpop: "p" } });
    expect(downloadFile).not.toHaveBeenCalled();
  });
  it("a mediated ref that names another host is moved to the platform origin, never sent there with the credential", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(new Blob(["b"]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await loadPhotoObjectUrl("//evil.example.test/base/connect/profile-photo?principal=abc");
    expect(String(f.mock.calls[0]![0]).startsWith("https://platform.example.test/")).toBe(true);
    await loadPhotoObjectUrl(".evil.example.test/base/connect/profile-photo?principal=abc");
    for (const c of f.mock.calls) expect(String(c[0]).startsWith("https://platform.example.test/")).toBe(true);
  });
  it("a mediated read that is refused, or throws, is null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    expect(await loadPhotoObjectUrl("/base/connect/profile-photo?principal=abc")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await loadPhotoObjectUrl("/base/connect/profile-photo?principal=abc")).toBeNull();
  });
});

describe("loadPhotoObjectUrl: file bytes", () => {
  it("asks downloadFile for the id the reference names, and returns the object url", async () => {
    vi.mocked(downloadFile).mockResolvedValue(new Blob(["x"]));
    expect(await loadPhotoObjectUrl("https://h.example.test/vault/e/filebytes0001")).toBe("blob:made");
    expect(vi.mocked(downloadFile).mock.calls[0]).toEqual(["filebytes0001", "https://h.example.test/vault/e/filebytes0001"]);
  });
  it("a reference that names no file is null and asks for nothing", async () => {
    expect(await loadPhotoObjectUrl("nofile")).toBeNull();
    expect(downloadFile).not.toHaveBeenCalled();
  });
  it("no bytes, or a download that throws, is null", async () => {
    vi.mocked(downloadFile).mockResolvedValueOnce(null);
    expect(await loadPhotoObjectUrl("/files/filebytes0001", "https://h.example.test/base")).toBeNull();
    vi.mocked(downloadFile).mockRejectedValueOnce(new Error("down"));
    expect(await loadPhotoObjectUrl("/files/filebytes0001", "https://h.example.test/base")).toBeNull();
  });
});

describe("vaultRootOf and PROFILE_POINTER_ATTR", () => {
  it("is the vault root with its own segment, whichever it is", () => {
    expect(vaultRootOf("https://ann.platform.example.test/vault/e/x")).toBe("https://ann.platform.example.test/vault");
    expect(vaultRootOf("https://id.platform.example.test/base")).toBe("https://id.platform.example.test/base");
    expect(vaultRootOf("https://h.example.test:8443/vault")).toBe("https://h.example.test:8443/vault");
  });
  it("is null for text that is not an address", () => {
    expect(vaultRootOf("not a url")).toBeNull();
    expect(vaultRootOf("")).toBeNull();
  });
  it("the pointer attribute is mnbProfile", () => {
    expect(PROFILE_POINTER_ATTR).toBe("mnbProfile");
  });
});
