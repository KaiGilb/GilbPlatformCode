import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetSystemHostLabels, setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";

// Only patchRecord and createRecord are replaced; the selfcard POST, the reads and the finding are real over a faked fetch.
const createRecord = vi.fn(async (..._a: unknown[]) => ({ id: "x", etag: null }));
const patchRecord = vi.fn(async (..._a: unknown[]) => ({ etag: null }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-records")>()), createRecord, patchRecord }));

const data = await import("./data");
const { pickVault } = await import("./platform");

const HOST = "https://alice.platform.example.test";
const VAULT = `${HOST}/vault`;
const vault = pickVault([{ vaultId: VAULT, "@id": `${VAULT}/e/seat-record`, modes: ["read", "write"], isLandingVault: true }])!;
const SELFCARD_URL = `${HOST}/lws/vault/${encodeURIComponent(VAULT)}/selfcard`;
const typed = { name: "Alice", email: "a@x.test", phone: "" };

type Doc = Record<string, unknown>;
let records: Map<string, Doc>;
let posts: { url: string; headers: Record<string, string>; body: unknown }[];
let reply: () => Promise<Response>;

beforeEach(async () => {
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
  posts = [];
  const derived = await selfCardIdForVault(VAULT);
  reply = async () => {
    records.set(derived, { "@id": `${VAULT}/e/${derived}`, "@type": "t:Person", "a:name": "Alice", "a:email": "a@x.test" });
    return new Response("{}", { status: 201, headers: { location: `${HOST}/lws/r/${derived}`, etag: '"1"' } });
  };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      posts.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return reply();
    }
    if (!url.includes("/lws/r/")) return new Response("{}", { status: 404 });
    const doc = records.get(decodeURIComponent(url.split("/lws/r/")[1]!.split("?")[0]!));
    return doc ? Response.json(doc, { headers: { etag: 'W/"v1"' } }) : new Response("", { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  resetLwsAuth(); resetBaseOrigin(); resetSystemVaultHosts(); resetSystemHostLabels();
});

test("W1: ensureSelfCard POSTs to the vault's selfcard door with DPoP, json, no Slug, and t:Person with only the non-empty facts", async () => {
  await data.ensureSelfCard(vault, typed);
  expect(posts).toHaveLength(1);
  expect(posts[0].url).toBe(SELFCARD_URL);
  expect(posts[0].headers).toMatchObject({ authorization: "DPoP t", dpop: "p", "content-type": "application/json" });
  expect(Object.keys(posts[0].headers).map((k) => k.toLowerCase())).not.toContain("slug");
  expect(posts[0].body).toEqual({ type: "t:Person", facts: { "a:name": "Alice", "a:email": "a@x.test" } });
});

test("W1: 201 is created: the id comes from Location, adopted is false, the etag is kept", async () => {
  const derived = await selfCardIdForVault(VAULT);
  expect(await data.ensureSelfCard(vault, typed)).toEqual({ id: derived, etag: '"1"', adopted: false });
});

test("W1: 200 is adopted (success), and with no Location the id is the body's @id", async () => {
  reply = async () => Response.json({ "@id": `${HOST}/lws/r/card-9` }, { status: 200, headers: { etag: '"7"' } });
  expect(await data.ensureSelfCard(vault, typed)).toEqual({ id: "card-9", etag: '"7"', adopted: true });
});

test("W1: 409 is a refusal that carries the server's message, and no createRecord fallback happens", async () => {
  reply = async () => Response.json({ error: "SelfCardIdentityUnknown", message: "Several cards could be yours; none is marked." }, { status: 409 });
  await expect(data.ensureSelfCard(vault, typed)).rejects.toThrow("Several cards could be yours; none is marked.");
  await expect(data.ensureSelfCard(vault, typed)).rejects.toBeInstanceOf(data.SelfCardRefusedError);
  expect(createRecord).not.toHaveBeenCalled();
  expect(posts.every((p) => p.url === SELFCARD_URL)).toBe(true);
});

test("W1: any other status throws with the HTTP status in the message", async () => {
  reply = async () => new Response("boom", { status: 500 });
  await expect(data.ensureSelfCard(vault, typed)).rejects.toThrow("500");
  reply = async () => new Response("no", { status: 403 });
  await expect(data.ensureSelfCard(vault, typed)).rejects.toThrow("403");
  expect(createRecord).not.toHaveBeenCalled();
});

test("W1: createProfileCard on a 201 sends one POST and no patch; the card is then found by the derived road", async () => {
  await data.createProfileCard(vault, typed);
  expect(posts).toHaveLength(1);
  expect(patchRecord).not.toHaveBeenCalled();
  const state = await data.loadProfile(vault);
  expect(state.kind).toBe("card");
  if (state.kind === "card") expect(state.card.road).toBe("derived");
});

test("W1: createProfileCard on a 200 (adopted) follows with the saveProfile patch of the typed values", async () => {
  const derived = await selfCardIdForVault(VAULT);
  records.set(derived, { "@id": `${VAULT}/e/${derived}`, "@type": "t:Person", "a:name": "Old" });
  reply = async () => new Response("{}", { status: 200, headers: { location: `${HOST}/lws/r/${derived}`, etag: '"1"' } });
  const r = await data.createProfileCard(vault, typed);
  expect(r.adopted).toBe(true);
  expect(patchRecord).toHaveBeenCalledTimes(1);
  expect(patchRecord.mock.calls[0].slice(0, 2)).toEqual([derived, { name: "Alice", email: "a@x.test" }]);
  expect(patchRecord.mock.calls[0][4]).toEqual({ ifMatch: 'W/"v1"' });
});

test("W1: cardHolds is true only when the card holds every typed non-empty value", async () => {
  const card = { id: "c", entityUri: "e", etag: null, road: "derived" as const, source: [], name: "Alice", email: "a@x.test", phone: "", photo: "", moreEmails: 0, morePhones: 0, rawEmail: "a@x.test", rawPhone: undefined };
  expect(data.cardHolds(card, typed)).toBe(true);
  expect(data.cardHolds({ ...card, email: "" }, typed)).toBe(false);
  expect(data.cardHolds({ ...card, name: "Other" }, typed)).toBe(false);
  expect(data.cardHolds(card, { ...typed, phone: "123" })).toBe(false);
});
