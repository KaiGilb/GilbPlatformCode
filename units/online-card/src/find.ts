// FIND an online card to connect a held person to.
//
// The holder searches by name (pre-filled from the local card). Each result shows the person's name and the contact points
// their card publishes to THIS viewer, so the holder can tell a stranger from the right person BEFORE confirming
// ("Before the holder confirms, the card shows the target's verified contact points"). Confirming
// is the holder's separate act and the only thing that writes (`linkWrite`).
//
// Uses the EXISTING routes only: `GET /base/connect/find-by-name` (visibility-aware, in the SQL) and the card route. The
// platform marks no contact point "verified": what is shown is what the person's card publishes at the viewer's rung, and
// the card says so (it never says "verified").
import { request, routeUrl, PlatformError, expectStatus, type PlatformClient, type RequestBound } from "@kaigilb/gilbplatformcode-record-sync";
import { cardName, contactPointsOf, readOnlineCard, type ContactPoint } from "./publicCard";

export const FIND_BY_NAME_PATH = "/base/connect/find-by-name";

/** Candidates shown, and so cards read, for one search. A larger answer is cut here and the cut is shown. */
export const MAX_CANDIDATES = 5;
/** Cards read at once. */
const CARD_READS_AT_ONCE = 3;

export interface OnlineCardCandidate {
  principal: string;
  /** The card's own name, else the names the find returned, else null. */
  name: string | null;
  contactPoints: ContactPoint[];
  /** Whether the card could be read to show contact points: 'unavailable' is not 'has none'. */
  cardRead: "ok" | "none" | "unavailable";
}

/** The people shown for one search, and how many people the find named in all (`total > candidates.length` is a cut the holder must be told of). */
export interface OnlineCardFindResult {
  candidates: OnlineCardCandidate[];
  total: number;
}

/** The people a name matches, in the server's order, with name and contact points. `[]` for a name nobody has or an empty name. */
export async function findOnlineCardCandidates(platform: PlatformClient, name: string, max: number = MAX_CANDIDATES): Promise<OnlineCardCandidate[]> {
  return (await findOnlineCardResult(platform, name, max)).candidates;
}

/** As `findOnlineCardCandidates`, with the number of distinct people the find named, so a cut can be shown ("showing 5 of 9"). */
export async function findOnlineCardResult(platform: PlatformClient, name: string, max: number = MAX_CANDIDATES, bound?: RequestBound): Promise<OnlineCardFindResult> {
  const q = name?.trim() ?? "";
  if (!q) return { candidates: [], total: 0 };
  const url = `${routeUrl(platform, FIND_BY_NAME_PATH)}?name=${encodeURIComponent(q)}&limit=50`;
  let answer;
  try {
    answer = await request(platform, "GET", url, undefined, { accept: "application/json" }, "no-store", bound);
  } catch (e) {
    if (e instanceof PlatformError) throw new PlatformError(`The search could not be made: ${e.message}`, 0, url, "");
    throw e;
  }
  expectStatus(answer, "GET", [200]);
  const matches = Array.isArray(answer.json?.matches) ? (answer.json!.matches as Record<string, unknown>[]) : [];
  const order: string[] = [];
  const named = new Map<string, string[]>();
  for (const m of matches) {
    const p = typeof m.principal === "string" ? m.principal : "";
    if (!p) continue;
    if (!named.has(p)) {
      named.set(p, []);
      order.push(p);
    }
    if (typeof m.value === "string" && m.value.trim()) named.get(p)!.push(m.value.trim());
  }
  const chosen = order.slice(0, Math.max(0, max));
  const out: OnlineCardCandidate[] = new Array(chosen.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= chosen.length) return;
      const principal = chosen[i]!;
      const read = await readOnlineCard(platform, principal, bound);
      if (read.kind === "card") {
        out[i] = { principal, name: cardName(read.card) ?? ([...new Set(named.get(principal))].join(" ") || null), contactPoints: contactPointsOf(read.card), cardRead: "ok" };
      } else {
        out[i] = { principal, name: [...new Set(named.get(principal))].join(" ") || null, contactPoints: [], cardRead: read.kind === "none" ? "none" : "unavailable" };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CARD_READS_AT_ONCE, chosen.length) }, () => worker()));
  return { candidates: out, total: order.length };
}
