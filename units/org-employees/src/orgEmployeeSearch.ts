// THE EMPLOYEES SEARCH of an organization card: a list of hundreds is searched, not scrolled. Pure.
//
// WHAT IS SEARCHED, STATED PLAINLY (measured 2026-10-16 against the platform on origin/main 7358b254):
//   There is NO server-side read that gives "this organization's employees whose name contains X". `GET /base/find-by-attribute` is value EQUALITY
//   on one attribute (`a:employer` = the organization; it cannot take a second constraint), and `GET /base/search` is a text match on one vault with
//   no join to the employer. So the search filters the people THIS card has already read, and says so (`searchScopeSentence`). It never claims to
//   have searched everyone while more records can still be loaded; the people it can match are only those the reader returned as readable, so a
//   person this reader may not read is never a candidate and never a number (a search must not reveal that an unreadable person exists or matches).
//   The proper fix is a platform increment (a name constraint on the same authorised find); that is the owner's decision, not this file's.
import type { OrgEmployee } from "./orgEmployees";

/** The short list on the card: the first 10 people. */
export const INLINE_EMPLOYEES = 10;
/** The pause after the last key before the list is filtered (typing never filters, or reads, on every key). */
export const SEARCH_DEBOUNCE_MS = 250;
/** The people the full list adds with each "Show more" (the reader's own page). */
export const FULL_LIST_STEP = 50;

/** A name as compared: lower case, accents removed, Norwegian ø and æ folded, runs of space collapsed. */
export function foldName(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The people whose name holds every word of the query. A blank query is everyone given. Only the people GIVEN can come back (this adds no one),
 * and a person with no name never matches a typed query.
 */
export function filterEmployeesByName<T extends Pick<OrgEmployee, "name">>(people: readonly T[], query: string): T[] {
  const words = foldName(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...people];
  return people.filter((p) => {
    if (p.name === null) return false;
    const name = foldName(p.name);
    return words.every((w) => name.includes(w));
  });
}

/** What the list holds: the Employees list says people, the Units list says units. */
export type ListNoun = "people" | "units";
const WORDS: Record<ListNoun, [string, string]> = { people: ["person", "people"], units: ["unit", "units"] };
const nounWord = (n: number, noun: ListNoun = "people") => WORDS[noun][n === 1 ? 0 : 1];

/**
 * The one sentence that says what a search looked through. `hasMore` is true while the reader still has records this card has not loaded.
 * ⛔ While more can be loaded it never says "all" or "everyone" as a claim; it says "not everyone" and how to load more.
 */
export function searchScopeSentence(a: { loaded: number; hasMore: boolean; where: "card" | "list"; noun?: ListNoun }): string {
  const n = a.loaded.toLocaleString("en");
  if (!a.hasMore) return a.where === "card" ? `Searching the ${n} ${nounWord(a.loaded, a.noun)} here.` : `Searching all ${n} ${nounWord(a.loaded, a.noun)}.`;
  return a.where === "card"
    ? `Searching the ${n} ${nounWord(a.loaded, a.noun)} loaded, not everyone. Show all to load more.`
    : `Searching the ${n} ${nounWord(a.loaded, a.noun)} loaded, not everyone. Show more loads the next ${FULL_LIST_STEP}.`;
}

/**
 * What a search that found no one says. ⛔ It says what was searched and nothing about who exists: while more can be loaded it does not say
 * there is no such person, and it never mentions a person the reader was not given (no count, no word about them).
 */
export function noMatchSentence(a: { loaded: number; hasMore: boolean; where: "card" | "list"; noun?: ListNoun }): string {
  const n = a.loaded.toLocaleString("en");
  if (!a.hasMore) return `No one among all ${n} ${nounWord(a.loaded, a.noun)} matches.`;
  return a.where === "card"
    ? `No one among the ${n} ${nounWord(a.loaded, a.noun)} loaded matches. Show all to load more.`
    : `No one among the ${n} ${nounWord(a.loaded, a.noun)} loaded matches. Show more loads the next ${FULL_LIST_STEP}.`;
}

/**
 * The ONE count of a group, over the rows it draws (a card that drew 10 rows said "20 people shown", then "12 people" over 10 rows).
 * `shown` is the rows drawn now (the card's short list: at most 10; the sheet: everything loaded), `loaded` what has been read, `total` the platform's
 * record count (never below `loaded`), `hasMore` whether more can be read. People say "records" for the platform's number (it can exceed the people);
 * units are one record each and say "units".
 *   more to read:    "10 people shown of 220 records" / "10 units shown of 200"
 *   all read, all drawn:  "12 people" / "1 unit"
 *   all read, some drawn: "10 of 12 people shown" / "10 of 12 units shown"
 */
export function groupCountText(a: { shown: number; loaded: number; hasMore: boolean; total: number; noun: ListNoun }): string {
  const n = (x: number) => x.toLocaleString("en");
  if (a.hasMore) return `${n(a.shown)} ${nounWord(a.shown, a.noun)} shown of ${n(Math.max(a.total, a.loaded))}${a.noun === "people" ? " records" : ""}`;
  if (a.shown < a.loaded) return `${n(a.shown)} of ${n(a.loaded)} ${nounWord(a.loaded, a.noun)} shown`;
  return `${n(a.loaded)} ${nounWord(a.loaded, a.noun)}`;
}

/**
 * What the list says while the next page is still being read and nothing loaded matches: not "no one matches" (the rows that
 * would match may be in the page being read), so it says it is still reading.
 */
export function stillLoadingSentence(a: { loaded: number; noun?: ListNoun }): string {
  return `Still reading the next ${FULL_LIST_STEP}. No one among the ${a.loaded.toLocaleString("en")} ${nounWord(a.loaded, a.noun)} loaded matches yet.`;
}
