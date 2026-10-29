import { afterEach, beforeEach, expect, test, vi } from "vitest";

const data = await import("./data");
const file = () => new File(["x"], "a.png", { type: "image/png" });
const card = { id: "c", entityUri: "https://a.gilb.com/vault/e/c", etag: null, road: "derived" as const, source: [], name: "A", email: "", phone: "", photo: "", moreEmails: 0, morePhones: 0, rawEmail: undefined, rawPhone: undefined };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); vi.stubEnv("VITE_SUPERSEDE_ONLY", "1"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("4.3: with the flag, addEntry throws SupersedeOnlyError and sends nothing", async () => {
  await expect(data.addEntry("https://a.gilb.com/vault", "Kettle", "Red")).rejects.toBeInstanceOf(data.SupersedeOnlyError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("4.3: with the flag, uploadPhoto and setProfilePhoto throw SupersedeOnlyError and send nothing", async () => {
  await expect(data.uploadPhoto("https://a.gilb.com/vault", file())).rejects.toBeInstanceOf(data.SupersedeOnlyError);
  await expect(data.setProfilePhoto("https://a.gilb.com/vault", card, file())).rejects.toBeInstanceOf(data.SupersedeOnlyError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("4.3: without the flag the guard does not fire", async () => {
  vi.stubEnv("VITE_SUPERSEDE_ONLY", "");
  await expect(data.addEntry("v", "  ", "")).rejects.toThrow("Give the record a name.");
});
