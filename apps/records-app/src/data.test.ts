import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetSystemHostLabels, setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";

// Only the two WRITES are replaced (they are the network seam); reads, the finding and the units are real.
const createRecord = vi.fn(async (..._a: unknown[]) => ({ id: "new1", etag: null }));
const patchRecord = vi.fn(async (..._a: unknown[]) => ({ etag: null }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-records")>()), createRecord, patchRecord }));
const listVaultRecordsPage = vi.fn();
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-vault-sets")>()), listVaultRecordsPage }));

const data = await import("./data");
const { pickVault } = await import("./platform");

const HOST = "https://alice.platform.example.test";
const VAULT = `${HOST}/vault`;
const ENTITY = `${VAULT}/e/seat-record`;
const vault = pickVault([{ vaultId: VAULT, "@id": ENTITY, modes: ["read", "write"], isLandingVault: true }])!;

type Doc = Record<string, unknown>;
let records: Map<string, Doc>;
let reads: string[];

const person = (id: string, over: Doc = {}): Doc => ({ "@id": `${VAULT}/e/${id}`, "@type": "t:Person", "a:name": "Alice", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_ALLOW_CREATE", "1");
  vi.stubEnv("VITE_PROFILE_WRITE", "1");
  vi.stubEnv("VITE_VAULT_URL", VAULT);
  setBaseOrigin("https://platform.example.test");
  setSystemVaultHosts(["id.platform.example.test"]);
  setSystemHostLabels(["id", "veda"]);
  const auth = { authorization: "DPoP t", dpop: "p" };
  setLwsAuth({ bearerHeaderFor: async () => auth, dpopReadAuth: async () => auth, dpopWriteAuth: async () => auth, invalidateDpop() {}, tokenManager: { getSession: async () => ({ principal: "p", vault: null, vaults: [] }), invalidate() {} } });
  records = new Map();
  reads = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    reads.push(url);
    if (!url.includes("/lws/r/")) return new Response("{}", { status: 404 });
    const doc = records.get(decodeURIComponent(url.split("/lws/r/")[1]!.split("?")[0]!));
    return doc ? Response.json(doc, { headers: { etag: 'W/"v1"' } }) : new Response("", { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  resetLwsAuth(); resetBaseOrigin(); resetSystemVaultHosts(); resetSystemHostLabels();
});

// ---- the own card (real own-card, plan-self-source and lws-records; only the fetch is faked) ----

test("a card found by the vault's profile pointer is the one patched", async () => {
  records.set("seat-record", { "@id": ENTITY, "@type": "t:Vault", "a:mnbProfile": { "@id": `${VAULT}/e/mnb-profile-abc` } });
  records.set("mnb-profile-abc", person("mnb-profile-abc", { "a:email": "a@x.test", "a:phone": "+1 555 0100" }));
  const state = await data.loadProfile(vault);
  expect(state.kind).toBe("card");
  if (state.kind !== "card") return;
  expect(state.card).toMatchObject({ id: "mnb-profile-abc", road: "pointer", name: "Alice", email: "a@x.test", phone: "+1 555 0100" });
  await data.saveProfile(vault, state.card, { name: "Alice", email: "b@x.test", phone: "+1 555 0100" });
  expect(patchRecord).toHaveBeenCalledTimes(1);
  expect(patchRecord.mock.calls[0].slice(0, 2)).toEqual(["mnb-profile-abc", { email: "b@x.test" }]);
});

test("a card found as the derived self-card is patched", async () => {
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, person(derived));
  const state = await data.loadProfile(vault);
  if (state.kind !== "card") throw new Error("expected a card");
  expect(state.card).toMatchObject({ id: derived, road: "derived" });
  await data.saveProfile(vault, state.card, { name: "Alice B", email: "", phone: "" });
  expect(patchRecord.mock.calls[0].slice(0, 2)).toEqual([derived, { name: "Alice B" }]);
});

test("road none sends no create and no write, and the picture is refused before any upload", async () => {
  records.set("seat-record", { "@id": ENTITY, "@type": "t:Vault" });
  expect(await data.loadProfile(vault)).toEqual({ kind: "none" });
  await expect(data.setProfilePhoto(vault, null, new File(["x"], "a.png", { type: "image/png" }))).rejects.toThrow("No profile card was found in your vault.");
  expect(createRecord).not.toHaveBeenCalled();
  expect(patchRecord).not.toHaveBeenCalled();
  expect(reads.some((u) => u.includes("/files"))).toBe(false);
});

test("a contact t:Person in the same vault is never read as the card, never patched", async () => {
  // A contact whose id looks like the app's own-card slug, plus a listing that would offer it first.
  records.set("mnb-profile-contact", person("mnb-profile-contact", { "a:name": "MNB Profile Bob" }));
  records.set("seat-record", { "@id": ENTITY, "@type": "t:Vault" });
  listVaultRecordsPage.mockResolvedValue({ records: [{ id: "mnb-profile-contact", entityUri: `${VAULT}/e/mnb-profile-contact` }], complete: true });
  expect(await data.loadProfile(vault)).toEqual({ kind: "none" });
  expect(reads.some((u) => u.includes("mnb-profile-contact"))).toBe(false);
  expect(listVaultRecordsPage).not.toHaveBeenCalled();
  // With the real card present the contact is still untouched.
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, person(derived));
  const state = await data.loadProfile(vault);
  if (state.kind !== "card") throw new Error("expected a card");
  await data.saveProfile(vault, state.card, { name: "Me", email: "", phone: "" });
  expect(patchRecord.mock.calls.every((c) => c[0] === derived)).toBe(true);
});

test("a second own card is reported and left alone", async () => {
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, person(derived));
  records.set("seat-record", { "@id": ENTITY, "@type": "t:Vault", "a:mnbProfile": { "@id": `${VAULT}/e/mnb-profile-abc` } });
  records.set("mnb-profile-abc", person("mnb-profile-abc"));
  const state = await data.loadProfile(vault);
  if (state.kind !== "card") throw new Error("expected a card");
  expect(state.otherOwnerCards.length).toBe(1);
  expect(patchRecord).not.toHaveBeenCalled();
  expect(createRecord).not.toHaveBeenCalled();
});

test("saving keeps the other emails of a multi-valued card and removes a cleared single value", async () => {
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, person(derived, { "a:email": ["a@x.test", "b@x.test"], "a:phone": "123" }));
  const state = await data.loadProfile(vault);
  if (state.kind !== "card") throw new Error("expected a card");
  expect(state.card).toMatchObject({ email: "a@x.test", moreEmails: 1 });
  await data.saveProfile(vault, state.card, { name: "Alice", email: "c@x.test", phone: "" });
  expect(patchRecord.mock.calls[0][1]).toEqual({ email: ["c@x.test", "b@x.test"], phone: null });
});

test("the patch is conditional on the version read", async () => {
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, person(derived));
  const state = await data.loadProfile(vault);
  if (state.kind !== "card") throw new Error("expected a card");
  await data.saveProfile(vault, state.card, { name: "Z", email: "", phone: "" });
  expect(patchRecord.mock.calls[0][4]).toEqual({ ifMatch: 'W/"v1"' });
});

// ---- the picture ----

test("the picture is PUT as raw bytes with name and face=whole, then the own card gets /files/<id>", async () => {
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, person(derived));
  const state = await data.loadProfile(vault);
  if (state.kind !== "card") throw new Error("expected a card");
  const calls: { url: string; init: RequestInit }[] = [];
  const base = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") {
      calls.push({ url: String(input), init });
      return Response.json({ entity: `${VAULT}/e/abc12345`, contentHash: "h", byteSize: 1, created: true }, { status: 201 });
    }
    return base(input, init);
  });
  const file = new File(["x"], "me.png", { type: "image/png" });
  patchRecord.mockImplementationOnce(async () => { records.set(derived, { ...records.get(derived)!, "a:profilePhoto": "/files/abc12345" }); return { etag: null }; });
  expect(await data.setProfilePhoto(vault, state.card, file)).toEqual({ confirmed: true, failed: [] });
  expect(calls).toHaveLength(1);
  expect(calls[0].url.startsWith(`${HOST}/lws/vault/`)).toBe(true);
  expect(calls[0].url).toContain("/files?");
  expect(calls[0].url).toContain("name=me.png");
  expect(calls[0].url).toContain("face=whole");
  expect(calls[0].init.body).toBe(file);
  expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBe("image/png");
  expect(patchRecord.mock.calls[0].slice(0, 2)).toEqual([derived, { profilePhoto: "/files/abc12345" }]);
});

async function uploadingCard() {
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, person(derived));
  const state = await data.loadProfile(vault);
  if (state.kind !== "card") throw new Error("expected a card");
  const base = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "PUT" ? Response.json({ entity: `${VAULT}/e/abc12345`, contentHash: "h", byteSize: 1, created: true }, { status: 201 }) : base(input, init));
  return { derived, card: state.card };
}

test("W4: a picture whose read-back card does not hold the uploaded location is not confirmed", async () => {
  const { card } = await uploadingCard();
  patchRecord.mockImplementationOnce(async () => ({ etag: null })); // accepted, nothing stored under the read key
  expect(await data.setProfilePhoto(vault, card, new File(["x"], "me.png", { type: "image/png" }))).toEqual({ confirmed: false, failed: ["profilePhoto"] });
});

test("W4: a picture stored under a key the read does not return (a different location) is not confirmed", async () => {
  const { derived, card } = await uploadingCard();
  patchRecord.mockImplementationOnce(async () => { records.set(derived, { ...records.get(derived)!, "a:profilePhoto": "/files/other" }); return { etag: null }; });
  expect((await data.setProfilePhoto(vault, card, new File(["x"], "me.png", { type: "image/png" }))).confirmed).toBe(false);
});

// ---- the entries ----

test("entryFromRow reads name and description from the served body, bare or a:-prefixed", () => {
  expect(data.entryFromRow({ id: "1", entityUri: "u", body: { name: "Kettle", description: "Red" } })).toMatchObject({ name: "Kettle", description: "Red" });
  expect(data.entryFromRow({ id: "2", entityUri: "u", body: { "a:name": "Pot" } })).toMatchObject({ name: "Pot", description: "" });
  expect(data.entryFromRow({ id: "3", entityUri: "u", label: "From label" }).name).toBe("From label");
});

test("search keeps an entry only when every word is in its name or description", () => {
  const entries = [
    { id: "1", entityUri: "", name: "Red kettle", description: "boils water" },
    { id: "2", entityUri: "", name: "Blue pot", description: "for soup" },
  ];
  expect(data.searchEntries(entries, "")).toHaveLength(2);
  expect(data.searchEntries(entries, "KETTLE water").map((t) => t.id)).toEqual(["1"]);
  expect(data.searchEntries(entries, "soup red")).toEqual([]);
});

test("addEntry creates the entry type with name and description in the named vault", async () => {
  createRecord.mockResolvedValueOnce({ id: "new1", etag: null });
  await data.addEntry(VAULT, " Kettle ", " Red ");
  expect(createRecord).toHaveBeenCalledWith(VAULT, "t:CatalogEntry", { name: "Kettle", description: "Red" }, "Kettle");
});

test("W3: addEntry reads the new record back by its id and address, and is confirmed only when the read-back holds the name", async () => {
  createRecord.mockResolvedValueOnce({ id: "new1", etag: null });
  records.set("new1", { "@id": `${VAULT}/e/new1`, "@type": "t:CatalogEntry", "a:name": "Kettle" });
  expect(await data.addEntry(VAULT, "Kettle", "")).toEqual({ id: "new1", confirmed: true });
  expect(reads.some((u) => u === `${HOST}/vault/r/new1` || u.includes("/r/new1"))).toBe(true);
});

test("W3: addEntry whose read-back lacks the name, or finds no record, is not confirmed", async () => {
  createRecord.mockResolvedValueOnce({ id: "new1", etag: null });
  records.set("new1", { "@id": `${VAULT}/e/new1`, "@type": "t:CatalogEntry", "a:description": "only this" });
  expect((await data.addEntry(VAULT, "Kettle", "")).confirmed).toBe(false);
  createRecord.mockResolvedValueOnce({ id: "gone", etag: null });
  expect((await data.addEntry(VAULT, "Kettle", "")).confirmed).toBe(false);
});

test("addEntry refuses an empty name and sends nothing", async () => {
  await expect(data.addEntry(VAULT, "  ", "x")).rejects.toThrow("Give the record a name.");
  expect(createRecord).not.toHaveBeenCalled();
});

test("listEntries pages until complete, using nextOffset, and lists only the entry type", async () => {
  listVaultRecordsPage
    .mockResolvedValueOnce({ records: [{ id: "1", entityUri: "u1", body: { name: "A" } }], complete: false, nextOffset: 100 })
    .mockResolvedValueOnce({ records: [{ id: "2", entityUri: "u2", body: { name: "B" } }], complete: true });
  const all = await data.listEntries("v");
  expect(all.map((t) => t.name)).toEqual(["A", "B"]);
  expect(listVaultRecordsPage.mock.calls[1][2]).toBe(100);
  expect(listVaultRecordsPage.mock.calls[0][1]).toEqual(["CatalogEntry"]);
});

test("listEntries throws, naming the cap, when the page guard trips", async () => {
  listVaultRecordsPage.mockResolvedValue({ records: [], complete: false, nextOffset: 1 });
  await expect(data.listEntries("v")).rejects.toThrow(`longer than ${data.MAX_LIST_PAGES} pages`);
  expect(listVaultRecordsPage).toHaveBeenCalledTimes(data.MAX_LIST_PAGES);
});

test("M13: pickVault takes the writable landing vault, else the first writable, skips a read-only landing vault, else null", () => {
  const row = (id: string, modes: string[], landing = false) => ({ vaultId: id, modes, isLandingVault: landing });
  expect(pickVault([row("w1", ["read", "write"]), row("w2", ["read", "write"], true)])!.vaultId).toBe("w2");
  expect(pickVault([row("r", ["read"], true), row("w1", ["read", "write"]), row("w2", ["write"])])!.vaultId).toBe("w1");
  expect(pickVault([row("r", ["read"], true), row("r2", ["read"])])).toBeNull();
  expect(pickVault([])).toBeNull();
});

test("a card with no entityUri is never patched with a null address, and no picture is uploaded for it", async () => {
  const card = { id: "c", entityUri: "", etag: null, road: "derived" as const, source: [], name: "A", email: "", phone: "", photo: "", moreEmails: 0, morePhones: 0, rawEmail: undefined, rawPhone: undefined };
  await expect(data.saveProfile(vault, card, { name: "B", email: "", phone: "" })).rejects.toThrow("no address");
  const upload = vi.fn();
  vi.stubGlobal("fetch", upload);
  await expect(data.setProfilePhoto(vault, card, new File(["x"], "a.png", { type: "image/png" }))).rejects.toThrow("no address");
  expect(patchRecord).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

// ---- 4.4 read-back: "saved" only when the vault shows the new value under the READ key (bare slug) ----

async function ownCard(served: Doc) {
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, person(derived, served));
  const state = await data.loadProfile(vault);
  if (state.kind !== "card") throw new Error("expected a card");
  return { derived, card: state.card };
}

test("4.4: a read-back that carries the new value under the bare slug is confirmed", async () => {
  const { derived, card } = await ownCard({ "a:email": "old@x.test" });
  patchRecord.mockImplementationOnce(async () => { records.set(derived, { ...records.get(derived)!, "a:email": undefined, email: "new@x.test" }); return { etag: null }; });
  expect(await data.saveProfile(vault, card, { name: "Alice", email: "new@x.test", phone: "" })).toEqual({ confirmed: true, failed: [] });
});

test("4.4: a read-back still holding the old value is not confirmed and names the field", async () => {
  const { card } = await ownCard({ email: "old@x.test" });
  patchRecord.mockImplementationOnce(async () => ({ etag: null })); // the vault accepted and changed nothing
  expect(await data.saveProfile(vault, card, { name: "Alice", email: "new@x.test", phone: "" })).toEqual({ confirmed: false, failed: ["email"] });
});

test("4.4: for a multi-valued term the edited value must be in the list", async () => {
  const { derived, card } = await ownCard({ email: ["a@x.test", "b@x.test"] });
  patchRecord.mockImplementationOnce(async () => { records.set(derived, { ...records.get(derived)!, email: ["c@x.test", "b@x.test"] }); return { etag: null }; });
  expect((await data.saveProfile(vault, card, { name: "Alice", email: "c@x.test", phone: "" })).confirmed).toBe(true);
  const again = await ownCard({ email: ["a@x.test", "b@x.test"] });
  patchRecord.mockImplementationOnce(async () => ({ etag: null }));
  expect(await data.saveProfile(vault, again.card, { name: "Alice", email: "c@x.test", phone: "" })).toEqual({ confirmed: false, failed: ["email"] });
});

test("4.4: a removed field is confirmed only when the read-back no longer has it", async () => {
  const { derived, card } = await ownCard({ phone: "123" });
  patchRecord.mockImplementationOnce(async () => { const d = { ...records.get(derived)! }; delete d.phone; records.set(derived, d); return { etag: null }; });
  expect((await data.saveProfile(vault, card, { name: "Alice", email: "", phone: "" })).confirmed).toBe(true);
});

test("4.4: nothing to change sends nothing and is confirmed", async () => {
  const { card } = await ownCard({ email: "a@x.test" });
  expect(await data.saveProfile(vault, card, { name: "Alice", email: "a@x.test", phone: "" })).toEqual({ confirmed: true, failed: [] });
  expect(patchRecord).not.toHaveBeenCalled();
});
