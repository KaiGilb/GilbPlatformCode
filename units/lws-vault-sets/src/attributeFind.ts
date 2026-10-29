import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { NotSignedInError, dpopReadAuth, invalidateDpop } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export interface AttributeFindResult {
  count: number;
  /** Entity URIs (`https://<host>/base/e/<id>`), one page. */
  ids: string[];
}

export type AttributeFindPage = {
  limit?: number;
  offset?: number;
};

/**
 * Reverse-lookup entities that currently assert `attr = value`.
 * `value` for an ontology-ref edge MUST be `{ "@id": "<uri>" }` — the write shape —
 * so the interned hash matches. A bare URI string hashes differently and returns 0.
 *
 * `limit`/`offset` need Base ≥ the attrfind-page increment. A 400 (unknown param on
 * older Base) retries once without paging so the default 20-id page still returns.
 *
 * 🔴 `origin` is the host ASKED, and the route has no crossing: it answers only from the store of the
 * process at that host (Rule_Code_gilb-store-topology rule 3). The apex (`baseOrigin()`, `https://platform.example.test`
 * in production) reaches the `:8787` process and its `base` DB; a vault minted since 2026-08-20 lives in
 * `base_pods`, so a find about it asked at the apex answers "none" with no error. A caller reading ONE vault passes `vaultOriginOf(vaultId)`. The DPoP proof is minted for the URL
 * fetched, so it is signed for that host. Omitted = the apex (the shipped behaviour of other callers).
 */
export async function findByAttribute(
  attr: string,
  value: unknown,
  page: AttributeFindPage = {},
  origin: string = baseOrigin(),
): Promise<AttributeFindResult> {
  const params = new URLSearchParams();
  params.set("attr", attr);
  params.set("value", typeof value === "string" ? value : JSON.stringify(value));
  if (page.limit != null) params.set("limit", String(page.limit));
  if (page.offset != null && page.offset > 0) params.set("offset", String(page.offset));
  const url = `${origin.replace(/\/+$/, "")}/base/find-by-attribute?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { ...(await dpopReadAuth("GET", url)), accept: "application/json" },
    });
  } catch (e) {
    if (e instanceof NotSignedInError) throw e;
    throw e;
  }
  if (res.status === 401) {
    invalidateDpop();
    throw new NotSignedInError();
  }
  if (res.status === 400 && (page.limit != null || (page.offset != null && page.offset > 0))) {
    return findByAttribute(attr, value, {}, origin);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`find-by-attribute failed: ${res.status} ${detail}`.trim());
  }
  const body = (await res.json()) as { count?: number; ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return { count: typeof body.count === "number" ? body.count : ids.length, ids };
}
