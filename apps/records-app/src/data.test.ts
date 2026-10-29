import { beforeEach, expect, test, vi } from "vitest";

const createRecord = vi.fn(async () => ({ id: "new1", etag: null }));
const patchRecord = vi.fn(async () => ({ etag: null }));
const readRecord = vi.fn();
const listVaultRecordsPage = vi.fn();
vi.mock("@kaigilb/gilbplatformcode-lws-records", () => ({ createRecord, patchRecord, readRecord }));
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", () => ({ listVaultRecordsPage, lwsReadFetch: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-session-bridge", () => ({ dpopWriteAuth: vi.fn(async () => ({ authorization: "DPoP x", dpop: "p" })) }));
vi.mock("@kaigilb/gilbplatformcode-vault-origin-rule", () => ({ vaultOriginOf: () => "https://me.example.test" }));

const data = await import("./data");

beforeEach(() => vi.clearAllMocks());

test("thingFromRow reads name and description from the served body, bare or a:-prefixed", () => {
  expect(data.thingFromRow({ id: "1", entityUri: "u", body: { name: "Kettle", description: "Red" } })).toMatchObject({ name: "Kettle", description: "Red" });
  expect(data.thingFromRow({ id: "2", entityUri: "u", body: { "a:name": "Pot" } })).toMatchObject({ name: "Pot", description: "" });
  expect(data.thingFromRow({ id: "3", entityUri: "u", label: "From label" }).name).toBe("From label");
});

test("search keeps a record only when every word is in its name or description", () => {
  const things = [
    { id: "1", entityUri: "", name: "Red kettle", description: "boils water" },
    { id: "2", entityUri: "", name: "Blue pot", description: "for soup" },
  ];
  expect(data.searchThings(things, "")).toHaveLength(2);
  expect(data.searchThings(things, "KETTLE water").map((t) => t.id)).toEqual(["1"]);
  expect(data.searchThings(things, "soup red")).toEqual([]);
});

test("addThing creates a t:Thing with name and description in the named vault", async () => {
  await data.addThing("https://me.example.test/vault", " Kettle ", " Red ");
  expect(createRecord).toHaveBeenCalledWith("https://me.example.test/vault", "t:Thing", { name: "Kettle", description: "Red" }, "Kettle");
});

test("addThing refuses an empty name and sends nothing", async () => {
  await expect(data.addThing("v", "  ", "x")).rejects.toThrow("Give the record a name.");
  expect(createRecord).not.toHaveBeenCalled();
});

test("listThings pages until complete, using nextOffset", async () => {
  listVaultRecordsPage
    .mockResolvedValueOnce({ records: [{ id: "1", entityUri: "u1", body: { name: "A" } }], complete: false, nextOffset: 100 })
    .mockResolvedValueOnce({ records: [{ id: "2", entityUri: "u2", body: { name: "B" } }], complete: true });
  const all = await data.listThings("v");
  expect(all.map((t) => t.name)).toEqual(["A", "B"]);
  expect(listVaultRecordsPage.mock.calls[1][2]).toBe(100);
});

test("saveProfile creates a t:Person when there is none, with only filled fields", async () => {
  await data.saveProfile("v", null, { name: "Ada", email: "ada@example.test", phone: "" });
  expect(createRecord).toHaveBeenCalledWith("v", "t:Person", { name: "Ada", email: "ada@example.test" }, "Ada");
});

test("saveProfile patches only what changed and removes a cleared field", async () => {
  const current = { id: "p1", entityUri: "e", etag: 'W/"1"', name: "Ada", email: "a@x.test", phone: "123", photo: "" };
  await data.saveProfile("v", current, { name: "Ada", email: "b@x.test", phone: "" });
  expect(patchRecord).toHaveBeenCalledWith("p1", { email: "b@x.test", phone: null }, "e", undefined, { ifMatch: 'W/"1"' });
  patchRecord.mockClear();
  await data.saveProfile("v", current, { name: "Ada", email: "a@x.test", phone: "123" });
  expect(patchRecord).not.toHaveBeenCalled();
});

test("uploadPhoto posts the bytes to the vault files door with face=whole and returns /files/<id>", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ entity: "https://me.example.test/base/e/abc12345", contentHash: "h", byteSize: 3, created: true }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  const loc = await data.uploadPhoto("https://me.example.test/vault", new File(["abc"], "me.png", { type: "image/png" }));
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain("https://me.example.test/lws/vault/");
  expect(url).toContain("face=whole");
  expect(init.method).toBe("POST");
  expect(loc).toBe("/files/abc12345");
  vi.unstubAllGlobals();
});

test("setProfilePhoto points the existing profile at the uploaded file", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ entity: "https://me.example.test/base/e/abc12345" }), { status: 201 })));
  const current = { id: "p1", entityUri: "e", etag: 'W/"1"', name: "", email: "", phone: "", photo: "" };
  await data.setProfilePhoto("v", current, new File(["x"], "a.png", { type: "image/png" }));
  expect(patchRecord).toHaveBeenCalledWith("p1", { profilePhoto: "/files/abc12345" }, "e", undefined, { ifMatch: 'W/"1"' });
  vi.unstubAllGlobals();
});
