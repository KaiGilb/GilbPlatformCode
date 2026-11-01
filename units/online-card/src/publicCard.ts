// A person's ONLINE CARD, read the way an app reads "their card".
//
// `GET /base/connect/public-card?principal=` on the identity node, with the app's AUTHENTICATED fetch: the server filters
// every field by the VIEWER's rung (anonymous: Public only; signed in: the rungs that admit this viewer; a denied value
// never leaves the server). ⛔ This module never filters a wider payload, never reads a field the server did not return,
// and offers nothing to write: the online card is read-only for the holder, always.
//
// Nothing here names a field: the predicate each field carries is the server's, and the label is the caller's lookup
// from the GilbVeda master (`labelFor`), ⛔ never a list in this package.
import { request, routeUrl, retryAfterMs, PlatformError, type PlatformClient, type RequestBound } from "@kaigilb/gilbplatformcode-record-sync";

export const ONLINE_CARD_READ_PATH = "/base/connect/public-card";

/** One field of the online card as the server returned it for THIS viewer. */
export interface OnlineCardField {
  /** The stored predicate, as served (`a:email`). */
  predicate: string;
  value: string;
  /** The rung that travelled with the value: exact, as served. */
  rung: string;
  /** The party's own claim entity this value is read from: what "Use this" cites as its source. null if the server named none. */
  sourceEntity: string | null;
  /** The purpose slot / profile kind the server recovered, when it did. */
  slot?: string;
  kind?: string;
  /** The id of the address (t:PlaceClaim) this part belongs to, as served; absent when the server named none (older server, or not an address part). */
  composite?: string;
}

export interface OnlineCardSkill {
  skillUri: string;
  rung: string;
  note?: string;
}

export interface OnlineCard {
  principal: string;
  fields: OnlineCardField[];
  skills: OnlineCardSkill[];
  /** The mediated photo path when this viewer may see it (bytes are gated by the server). */
  photoUrl: string | null;
}

export type OnlineCardRead =
  | { kind: "card"; card: OnlineCard }
  /** 404: no such person, or the vault is not a person's. The reason is not read. */
  | { kind: "none" }
  | { kind: "unavailable"; status: number }
  /** 429: wait `retryAfterMs` (null: the platform named no time). */
  | { kind: "busy"; retryAfterMs: number | null };

const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** The card route's own wire keys for a person's name (the platform's profile-field and name postings). Not a field list. */
const NAME_PREDICATES = ["a:givenName", "a:familyName"] as const;

/**
 * Read one person's online card: ONE request. Called when a card is opened, ⛔ never per list row.
 * Fields of another principal, and fields with no text, are not part of the card.
 */
export async function readOnlineCard(platform: PlatformClient, principal: string, bound?: RequestBound): Promise<OnlineCardRead> {
  const who = principal?.trim() ?? "";
  if (!who) return { kind: "none" };
  const url = `${routeUrl(platform, ONLINE_CARD_READ_PATH)}?principal=${encodeURIComponent(who)}`;
  let answer;
  try {
    answer = await request(platform, "GET", url, undefined, { accept: "application/json" }, "no-store", bound);
  } catch (e) {
    if (e instanceof PlatformError) return { kind: "unavailable", status: 0 };
    throw e;
  }
  if (answer.status === 404) return { kind: "none" };
  if (answer.status === 429) return { kind: "busy", retryAfterMs: retryAfterMs(answer.headers) };
  if (answer.status !== 200 || !answer.json) return { kind: "unavailable", status: answer.status };
  return { kind: "card", card: parseOnlineCard(who, answer.json) };
}

/**
 * The online card of `principal` from a card-route body, however the app came by the body (this module's own read, or an app that
 * already read the same route for its own screen: one card read per open, never two). Fields of another principal and fields with
 * no text are not part of the card; one value named twice is one line; the person's name comes first.
 */
export function parseOnlineCard(principal: string, body: Record<string, unknown>): OnlineCard {
  const who = principal;
  const fields: OnlineCardField[] = [];
  // The card route can name one value twice (the name postings and the profile fields both carry it, measured on a scratch rig):
  // the same predicate, value and rung is ONE line for the reader. A different value or rung is never merged. A field that names
  // the address it belongs to (`composite`) is one line only within that address: two addresses that both name one place at one
  // rung keep one line each. A field with no composite keeps the key it always had.
  const seen = new Set<string>();
  for (const f of Array.isArray(body.fields) ? body.fields : []) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    if (text(r.principal) !== who) continue;
    const value = text(r.value);
    const predicate = text(r.field);
    if (!predicate || value.trim() === "") continue;
    const composite = text(r.composite).trim() === "" ? "" : text(r.composite);
    const key = JSON.stringify(composite ? [predicate, value, text(r.rung), composite] : [predicate, value, text(r.rung)]);
    if (seen.has(key)) continue;
    seen.add(key);
    const out: OnlineCardField = { predicate, value, rung: text(r.rung), sourceEntity: text(r.sourceEntity) || null };
    if (typeof r.slot === "string") out.slot = r.slot;
    if (typeof r.kind === "string") out.kind = r.kind;
    if (composite) out.composite = composite;
    fields.push(out);
  }
  // The person's name first (given, then family), then every other field in the server's own order.
  const nameRank = (f: OnlineCardField): number => {
    const i = (NAME_PREDICATES as readonly string[]).indexOf(f.predicate);
    return i < 0 ? NAME_PREDICATES.length : i;
  };
  fields.sort((a, b) => nameRank(a) - nameRank(b));
  const skills: OnlineCardSkill[] = [];
  for (const s of Array.isArray(body.skills) ? body.skills : []) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    if (!text(r.skillUri)) continue;
    const sk: OnlineCardSkill = { skillUri: text(r.skillUri), rung: text(r.rung) };
    if (typeof r.note === "string" && r.note.trim() !== "") sk.note = r.note;
    skills.push(sk);
  }
  return { principal: who, fields, skills, photoUrl: typeof body.photoUrl === "string" ? body.photoUrl : null };
}

/** "Given Family" from the card's own name fields, or null when it shows neither. */
export function cardName(card: Pick<OnlineCard, "fields">): string | null {
  const parts = NAME_PREDICATES.map((p) => card.fields.find((f) => f.predicate === p)?.value.trim() ?? "").filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** The contact points a card shows (email, phone, online account), so a holder can tell the right person from a look-alike. */
const CONTACT_PREDICATES = ["a:email", "a:phone", "a:account"] as const;
export interface ContactPoint {
  predicate: string;
  value: string;
  rung: string;
}
export function contactPointsOf(card: Pick<OnlineCard, "fields">): ContactPoint[] {
  return card.fields
    .filter((f) => (CONTACT_PREDICATES as readonly string[]).includes(f.predicate))
    .map((f) => ({ predicate: f.predicate, value: f.value, rung: f.rung }));
}
