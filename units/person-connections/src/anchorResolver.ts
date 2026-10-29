// THE ONE FILE that knows the resolver's HTTP contract.
//
// The platform's resolver: `GET /base/connect/online-card-anchor?record=<the caller's own record>`, on the
// IDENTITY node, signed in. The record is the ONLY input (an email, a name or a principal typed in is not one).
//   200 { surface, kind: "person" | "organization", principal | null, vaultId | null, entity, vaultRepresents }
//   404 { code: "no_online_card" }  the ONE refusal: not your record, no link, an ambiguous link, a loop, a target
//                                   that is not a card. Same status, body and headers for every reason: no reason is read.
//   401 anonymous    503 the caller's own vault could not be reached
// If the final contract differs, this file is the swap; nothing else in the package or the apps names the route.
//
// ⛔ A 404 is "none", ⛔ never "denied" and ⛔ never "does not exist": the platform makes them one answer on purpose (no
//    existence oracle), so this module cannot tell them apart and does not try. ⛔ A failure to ask is `unavailable`,
//    which the card says in its own words, ⛔ never as "no online card".
import { request, routeUrl, retryAfterMs, PlatformError, type PlatformClient, type RequestBound } from "@kaigilb/gilbplatformcode-record-sync";

export const ONLINE_CARD_ANCHOR_PATH = "/base/connect/online-card-anchor";

export type ResolveOutcome =
  | { kind: "person"; principal: string; entity: string }
  /** The organization slice's seam: the resolver already answers it; the person slice does not draw it. */
  | { kind: "organization"; vaultId: string; entity: string }
  | { kind: "none" }
  | { kind: "unauthenticated" }
  | { kind: "unavailable"; status: number }
  /** 429: the platform asks the caller to wait (`Retry-After`); `retryAfterMs` is null when it named no time. */
  | { kind: "busy"; retryAfterMs: number | null };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Resolve the online card a held record is linked to: ONE request per card open, never per list row.
 *
 * @param platform the identity node's client (`origin` = the platform's apex, `fetch` = the app's authenticated fetch)
 * @param record the holder's own record, as an absolute entity address
 */
export async function resolveOnlineCard(platform: PlatformClient, record: string, bound?: RequestBound): Promise<ResolveOutcome> {
  const rec = record?.trim() ?? "";
  if (!rec) return { kind: "none" };
  const url = `${routeUrl(platform, ONLINE_CARD_ANCHOR_PATH)}?record=${encodeURIComponent(rec)}`;
  let answer;
  try {
    answer = await request(platform, "GET", url, undefined, { accept: "application/json" }, "no-store", bound);
  } catch (e) {
    if (e instanceof PlatformError) return { kind: "unavailable", status: 0 };
    throw e;
  }
  if (answer.status === 404) return { kind: "none" };
  if (answer.status === 401) return { kind: "unauthenticated" };
  if (answer.status === 429) return { kind: "busy", retryAfterMs: retryAfterMs(answer.headers) };
  if (answer.status !== 200) return { kind: "unavailable", status: answer.status };
  const j = answer.json;
  // The resolver's contract: branch on what the vault REPRESENTS (exact type address); the `kind` word is the fallback for an answer without it.
  const rep = str(j?.vaultRepresents);
  const kind = rep.endsWith("/Person") ? "person" : rep.endsWith("/Organization") ? "organization" : str(j?.kind);
  if (kind === "person" && str(j?.principal)) return { kind: "person", principal: str(j?.principal), entity: str(j?.entity) };
  if (kind === "organization" && str(j?.vaultId)) return { kind: "organization", vaultId: str(j?.vaultId), entity: str(j?.entity) };
  return { kind: "unavailable", status: 200 };
}
