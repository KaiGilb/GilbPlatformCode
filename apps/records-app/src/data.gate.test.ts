import { afterEach, beforeEach, expect, test, vi } from "vitest";

const data = await import("./data");
const PIN = "https://a.gilb.com/vault";
const OTHER = "https://b.gilb.com/vault";
const file = () => new File(["x"], "a.png", { type: "image/png" });
const card = { id: "c", entityUri: "https://a.gilb.com/vault/e/c", etag: null, road: "derived" as const, source: [], name: "A", email: "", phone: "", photo: "", moreEmails: 0, morePhones: 0, rawEmail: undefined, rawPhone: undefined };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); vi.stubEnv("VITE_VAULT_URL", PIN); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("gate: without VITE_ALLOW_CREATE=1, addEntry, uploadPhoto, setProfilePhoto and ensureSelfCard throw CreateNotAllowedError and send nothing", async () => {
  vi.stubEnv("VITE_ALLOW_CREATE", "");
  await expect(data.addEntry(PIN, "Kettle", "Red")).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  await expect(data.uploadPhoto(PIN, file())).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  await expect(data.setProfilePhoto(PIN, card, file())).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  await expect(data.ensureSelfCard(PIN, { name: "A", email: "", phone: "" })).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("gate: with VITE_ALLOW_CREATE=1 but a vault that is not the pinned one, every create is refused and nothing is sent", async () => {
  vi.stubEnv("VITE_ALLOW_CREATE", "1");
  await expect(data.addEntry(OTHER, "Kettle", "Red")).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  await expect(data.uploadPhoto(OTHER, file())).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  await expect(data.setProfilePhoto(OTHER, card, file())).rejects.toBeInstanceOf(data.CreateNotAllowedError);
  await expect(data.ensureSelfCard(OTHER, { name: "A", email: "", phone: "" })).rejects.toBeInstanceOf(data.CreateNotAllowedError);
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
