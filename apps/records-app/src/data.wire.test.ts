import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

// Nothing of lws-records or lws-vault-sets is replaced here: only fetch. The type is a literal in this file.
const { addEntry, listEntries } = await import("./data");
const VAULT = "https://alice.platform.example.test/vault";
let calls: { url: string; method: string; body: string | null }[];

beforeEach(() => {
  setBaseOrigin("https://platform.example.test");
  setSystemVaultHosts(["id.platform.example.test"]);
  const a = { authorization: "DPoP t", dpop: "p" };
  setLwsAuth({ bearerHeaderFor: async () => a, dpopReadAuth: async () => a, dpopWriteAuth: async () => a, invalidateDpop() {}, tokenManager: { getSession: async () => ({ principal: "p", vault: null, vaults: [] }), invalidate() {} } });
  calls = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : null });
    if (init?.method === "POST") return new Response("{}", { status: 201, headers: { location: `${VAULT}/e/new1`, etag: '"1"' } });
    if (url.includes("/records")) return Response.json({ records: [], total: 0, complete: true, pageSize: 20, offset: 0 });
    return new Response("{}", { status: 404 });
  });
});
afterEach(() => { vi.unstubAllGlobals(); resetLwsAuth(); resetBaseOrigin(); resetSystemVaultHosts(); });

test("M6: the create goes out with the type 't:Thing' and the list asks for type 'Thing'", async () => {
  await addEntry(VAULT, "Kettle", "Red");
  const create = calls.find((c) => c.method === "POST")!;
  expect(JSON.parse(create.body!).type).toBe("t:Thing");
  await listEntries(VAULT);
  const list = calls.find((c) => c.url.includes("/records"))!;
  expect(new URL(list.url).searchParams.getAll("type")).toEqual(["Thing"]);
});
