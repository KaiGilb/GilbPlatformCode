// The list of who has access, with every row told apart.
//
// The platform names a person in the list only when it may: for the others the share sheet's row reads what the key is
// ("Registered principal", "Principal key"), so two such people with the same access would read exactly alike, and a person
// could not tell whose access a Remove takes away. The one thing the platform gives for every row is the key itself. This
// adds the end of that key to the label of each row the platform left unnamed: enough of it that no two rows share it.
// Nothing is invented and nothing is kept on the device: the same list reads the same after a reload and on another device.
import { defaultShareApi, type AccessRow, type AccessView } from "@kaigilb/gilbplatformcode-vault-share-sheet";

/** The shortest key ending shown. */
const SHORTEST = 6;

/** The last piece of a key's address: what differs between two people's keys on one platform. */
function lastPiece(key: string): string {
  const cut = key.replace(/[/#?]+$/, "");
  return cut.slice(Math.max(cut.lastIndexOf("/"), cut.lastIndexOf("#")) + 1) || cut;
}

/**
 * The ending to show for each key: the last 6 characters of its last piece, or as many more as it takes for every ending
 * to differ. Two keys whose last pieces are the same whole text (keys on two hosts) are shown whole.
 *
 * @param keys the keys of the rows to tell apart, each one different
 * @returns the ending of each key, by key
 */
export function keyEndings(keys: readonly string[]): Map<string, string> {
  const pieces = keys.map(lastPiece);
  const longest = Math.max(0, ...pieces.map((p) => p.length));
  for (let n = SHORTEST; n <= longest; n++) {
    const ends = pieces.map((p) => p.slice(-n));
    if (new Set(ends).size === keys.length) return new Map(keys.map((k, i) => [k, ends[i]!]));
  }
  if (new Set(pieces).size === keys.length) return new Map(keys.map((k, i) => [k, pieces[i]!]));
  return new Map(keys.map((k) => [k, k]));
}

/**
 * The view with every unnamed row told apart by the end of its key.
 *
 * @param view the access list as the share sheet's model read it
 * @param label the words for a row with no name: what the key is, and the end of the key
 * @returns the same view; a row the platform named is not changed
 */
export function tellApart(view: AccessView, label: (what: string, keyEnding: string) => string): AccessView {
  if (!view.controlled) return view;
  const all = [...(view.owner ? [view.owner] : []), ...view.rows];
  const endings = keyEndings([...new Set(all.filter((r) => !r.named).map((r) => r.principal))]);
  const one = (r: AccessRow): AccessRow => (r.named ? r : { ...r, label: label(r.label, endings.get(r.principal) ?? r.principal) });
  return { controlled: true, owner: view.owner ? one(view.owner) : null, rows: view.rows.map(one) };
}

/**
 * The share sheet's read of who has access, with unnamed rows told apart. Pass it as the sheet's `api.load`.
 *
 * @param label the words for a row with no name
 * @returns a `load(vaultId)` for the sheet
 */
export function loadToldApart(label: (what: string, keyEnding: string) => string): (vaultId: string) => Promise<AccessView> {
  return async (vaultId) => tellApart(await defaultShareApi.load(vaultId), label);
}
