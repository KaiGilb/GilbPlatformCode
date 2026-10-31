// Test-only. A TWO-HOST view of the platform's `find-by-attribute`, in front of `fakeFetch`. Adapted from GilbApp (private repo `KaiGilb/GilbApp`,
// commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/place/twoHostFindFake.ts`. Its hosts follow the recorded production ingress:
//   - the apex and the legacy host set answer from store "base";
//   - `hytta` (fakePlaceStore.VAULT, "vault B", a vault minted since the move) answers from store "base_pods".
// The route has no crossing: a find answers ONLY from the store behind the host asked.
// Changes from the source: the hosts are `*.platform.example.test`; the source verified an ES256 DPoP proof and the apex's htu rewrite
// to the identity host, which belong to the auth seam (`lws-session-bridge`) and not to this unit, so here the proof the fake auth seam signs
// (`htu=<origin><path>`, test/support.ts) is only compared with the host the request names; the typed-list and token-mint doors are dropped.
import * as fake from "./fakePlaceStore";
import { TOKEN } from "./support";

export const STORE_OF_HOST: Record<string, string> = {
  "platform.example.test": "base",
  "id.platform.example.test": "base",
  "olda.platform.example.test": "base",
  "geo.platform.example.test": "base",
  "hytta.platform.example.test": "base_pods",
};
export const VAULT_A = "https://olda.platform.example.test/base";
export const VAULT_B = fake.VAULT; // https://hytta.platform.example.test/base

export interface ReqRow {
  method: string;
  host: string;
  path: string;
  limit: string | null;
  offset: string | null;
  htu: string | null;
  htuExpected: string | null;
  status: number;
}
export const server = {
  latencyMs: 0,
  log: [] as ReqRow[],
  /** Answer 400 to a paged find (an older platform), to exercise the retry. */
  refusePaging: false,
  /** Called after a find computed its answer, before it returns (e.g. delete a claim mid-read). */
  afterFind: null as null | ((ids: string[]) => void),
  /** Block the next find until released (an in-flight read). */
  holdNextFind: null as null | Promise<void>,
};
export function resetServer(): void {
  server.latencyMs = 0;
  server.log = [];
  server.refusePaging = false;
  server.afterFind = null;
  server.holdNextFind = null;
  fake.topology.storeOfHost = STORE_OF_HOST;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function serverFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  if (server.latencyMs) await sleep(server.latencyMs);
  const row: ReqRow = { method, host: url.host, path: url.pathname, limit: url.searchParams.get("limit"), offset: url.searchParams.get("offset"), htu: null, htuExpected: null, status: 0 };
  server.log.push(row);
  if (url.pathname !== "/base/find-by-attribute") {
    const res = await fake.fakeFetch(input, init);
    row.status = res.status;
    return res;
  }
  const headers = new Headers(init?.headers as HeadersInit);
  row.htuExpected = `${url.origin}${url.pathname}`;
  const proof = headers.get("dpop");
  row.htu = proof?.startsWith("htu=") ? proof.slice(4) : null;
  if (row.htu !== row.htuExpected || headers.get("authorization") !== `DPoP ${TOKEN}`) {
    row.status = 401;
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  if (server.refusePaging && (url.searchParams.has("limit") || url.searchParams.has("offset"))) {
    row.status = 400;
    return new Response(JSON.stringify({ error: "unknown param" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const res = await fake.fakeFetch(input, init);
  if (res.ok && server.afterFind) server.afterFind(((await res.clone().json()) as { ids: string[] }).ids);
  if (server.holdNextFind) {
    const h = server.holdNextFind;
    server.holdNextFind = null;
    await h;
  }
  row.status = res.status;
  return res;
}
