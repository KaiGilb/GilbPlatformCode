import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

const data = await import("./data");
const PIN = "https://a.gilb.com/vault";
const OTHER = "https://b.gilb.com/vault";
const file = () => new File(["x"], "a.png", { type: "image/png" });
const card = { id: "c", entityUri: "https://b.gilb.com/vault/e/c", etag: null, road: "derived" as const, source: [], name: "A", email: "", phone: "", photo: "", moreEmails: 0, morePhones: 0, rawEmail: undefined, rawPhone: undefined };
const rw = (vaultId: string) => ({ vaultId, modes: ["read", "write"] });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => { const a = { authorization: "DPoP t", dpop: "p" }; setLwsAuth({ bearerHeaderFor: async () => a, dpopReadAuth: async () => a, dpopWriteAuth: async () => a, invalidateDpop() {}, tokenManager: { getSession: async () => ({ principal: "p", vault: null, vaults: [] }), invalidate() {} } }); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); vi.stubEnv("VITE_VAULT_URL", PIN); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetBaseOrigin(); resetSystemVaultHosts(); resetLwsAuth(); });

test("gate: without VITE_ALLOW_CREATE=1 or with another vault, addEntry throws CreateNotAllowedError and sends nothing", async () => {
  vi.stubEnv("VITE_ALLOW_CREATE", "");
  await expect(data.addEntry(PIN, "Kettle", "Red")).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  vi.stubEnv("VITE_ALLOW_CREATE", "1");
  await expect(data.addEntry(OTHER, "Kettle", "Red")).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("gate: with VITE_ALLOW_CREATE=1 and no pin at all, creates are refused", async () => {
  vi.stubEnv("VITE_ALLOW_CREATE", "1");
  vi.stubEnv("VITE_VAULT_URL", "");
  await expect(data.addEntry(PIN, "Kettle", "Red")).rejects.toBeInstanceOf(data.CreateNotAllowedError);
});

test("gate: with VITE_ALLOW_CREATE=1 and the pinned vault (trailing slash ignored) the guard does not fire", async () => {
  vi.stubEnv("VITE_ALLOW_CREATE", "1");
  expect(data.createsAllowed(PIN)).toBe(true);
  expect(data.createsAllowed(`${PIN}/`)).toBe(true);
  expect(data.createsAllowed(OTHER)).toBe(false);
  await expect(data.addEntry(PIN, "  ", "")).rejects.toThrow("Give the record a name.");
});

test("B10 W3: without VITE_PROFILE_WRITE=1, saveProfile, uploadPhoto, setProfilePhoto and ensureSelfCard throw ProfileWriteNotAllowedError and send nothing", async () => {
  vi.stubEnv("VITE_ALLOW_CREATE", "1"); // the create gate does not open the profile
  for (const flag of ["", "0"]) {
    vi.stubEnv("VITE_PROFILE_WRITE", flag);
    await expect(data.saveProfile(rw(OTHER), card, { name: "B", email: "", phone: "" })).rejects.toBeInstanceOf(data.ProfileWriteNotAllowedError);
    await expect(data.uploadPhoto(rw(OTHER), file())).rejects.toBeInstanceOf(data.ProfileWriteNotAllowedError);
    await expect(data.setProfilePhoto(rw(OTHER), card, file())).rejects.toBeInstanceOf(data.ProfileWriteNotAllowedError);
    await expect(data.ensureSelfCard(rw(OTHER), { name: "A", email: "", phone: "" })).rejects.toBeInstanceOf(data.ProfileWriteNotAllowedError);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test("B10 W3: with the flag on but no write mode on the profile vault, every profile write is refused", async () => {
  vi.stubEnv("VITE_PROFILE_WRITE", "1");
  const ro = { vaultId: OTHER, modes: ["read"] };
  await expect(data.saveProfile(ro, card, { name: "B", email: "", phone: "" })).rejects.toBeInstanceOf(data.ProfileWriteNotAllowedError);
  await expect(data.setProfilePhoto(ro, card, file())).rejects.toBeInstanceOf(data.ProfileWriteNotAllowedError);
  await expect(data.ensureSelfCard(ro, { name: "A", email: "", phone: "" })).rejects.toBeInstanceOf(data.ProfileWriteNotAllowedError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("B10 W3: profileWritesAllowed needs the flag exactly \"1\" and write; the pinned vault does not matter", () => {
  vi.stubEnv("VITE_PROFILE_WRITE", "1");
  expect(data.profileWritesAllowed(rw(OTHER))).toBe(true);
  expect(data.profileWritesAllowed({ vaultId: OTHER, modes: ["read"] })).toBe(false);
  expect(data.profileWritesAllowed({ vaultId: OTHER })).toBe(false);
  vi.stubEnv("VITE_PROFILE_WRITE", "true");
  expect(data.profileWritesAllowed(rw(OTHER))).toBe(false);
});

test("B10 W3: the picture upload goes to the profile vault's files, with the create gate off", async () => {
  vi.stubEnv("VITE_PROFILE_WRITE", "1");
  vi.stubEnv("VITE_ALLOW_CREATE", "");
  setBaseOrigin("https://gilb.com");
  setSystemVaultHosts(["id.gilb.com"]);
  fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
  await expect(data.uploadPhoto(rw(OTHER), file())).rejects.toThrow("HTTP 500");
  expect(String(fetchMock.mock.calls[0]![0])).toContain(encodeURIComponent(OTHER));
  expect(String(fetchMock.mock.calls[0]![0])).not.toContain(encodeURIComponent(PIN));
});
