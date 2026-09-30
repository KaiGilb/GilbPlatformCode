/**
 * Links from one record to other records ("hands off to").
 *
 * Read every link. Write the whole list, or write nothing.
 * One link is a single `{ "@id" }`. Two or more are an array, in order.
 * A short form that is not a bare id (`prefix:rest`, or any text with `/`
 * that is not http or https) is an unknown address. A save must refuse it.
 * Guessing a host would point the link at a different record.
 *
 * Two full addresses on different hosts are different links even when the
 * last segment matches. Removing by the last segment removes the wrong link.
 */

export type HandsOffToValue = { "@id": string } | { "@id": string }[];
export type HandsOffToInput = string | readonly string[];

export interface HandsOffToReading {
  /** Every link, in stored order, trimmed, each once. */
  ids: string[];
  /** Members that are present but are not a link. A rewrite while this is above 0 drops them. */
  unreadable: number;
}

export interface HandsOffHost {
  "@id"?: string;
}

export interface HandsOffToSavePlan {
  /** The whole list to write, in order. A kept link is the served text, not a rewritten one. */
  write: string[];
  /** Links this save adds. A kept link is not in here. */
  added: string[];
}

export function handsOffUnreadableText(unreadable: number): string {
  return `${unreadable} stored hands-off value${unreadable === 1 ? "" : "s"} this app cannot read`;
}

export class HandsOffToUnreadableError extends Error {
  constructor(unreadable: number) {
    super(
      `Hands off to holds ${handsOffUnreadableText(unreadable)} — save refused so that no link is lost.`,
    );
    this.name = "HandsOffToUnreadableError";
  }
}

export class HandsOffToUnknownAddressError extends Error {
  constructor(link: string) {
    super(
      `Hands off to holds "${link.trim()}", which is not a full web address, so this app cannot tell ` +
        "where it points — save refused so it is not stored as text or pointed at a wrong address. " +
        "Remove that link from the list that holds it, then save.",
    );
    this.name = "HandsOffToUnknownAddressError";
  }
}

/** True for a colon-prefix (`base:e/x`, `t:X`) or any non-http text that contains `/`. A full http(s) address is false. A bare id is false. */
export function isHandsOffAddressUnknown(link: string): boolean {
  const t = link.trim();
  if (/^https?:\/\//i.test(t)) return false;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) || t.includes("/");
}

function readMember(member: unknown): string | null {
  if (typeof member === "string") return member.trim();
  if (member != null && typeof member === "object" && !Array.isArray(member)) {
    const id = (member as { "@id"?: unknown })["@id"];
    if (typeof id === "string") return id.trim();
  }
  return null;
}

/** Absent, one link, or an array. Empty members are skipped. Unreadable members are counted. */
export function readHandsOffTo(value: unknown): HandsOffToReading {
  if (value === undefined || value === null) return { ids: [], unreadable: 0 };
  const members: readonly unknown[] = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  let unreadable = 0;
  for (const member of members) {
    const id = readMember(member);
    if (id === null) unreadable += 1;
    else if (id !== "" && !ids.includes(id)) ids.push(id);
  }
  return { ids, unreadable };
}

/**
 * Framed `handsOffTo`, then legacy `hands-off-to`, then raw `a:handsOffTo`.
 * A present camelCase value blocks the later spellings, including `""`.
 * Null falls through. A missing raw key yields undefined.
 */
export function servedHandsOffToValue(doc: Record<string, unknown>): unknown {
  if (doc.handsOffTo !== undefined && doc.handsOffTo !== null) return doc.handsOffTo;
  if (doc["hands-off-to"] !== undefined && doc["hands-off-to"] !== null) return doc["hands-off-to"];
  return doc["a:handsOffTo"];
}

export function servedHandsOffTo(doc: Record<string, unknown>): HandsOffToReading {
  return readHandsOffTo(servedHandsOffToValue(doc));
}

/** One link stays one object. Two or more become an array. None is null. */
export function handsOffToWireValue(ids: readonly string[]): HandsOffToValue | null {
  if (ids.length === 0) return null;
  const first = ids[0];
  if (ids.length === 1) {
    if (first === undefined) return null;
    return { "@id": first };
  }
  return ids.map((id) => ({ "@id": id }));
}

/** Trim, drop blanks, keep the first copy of each link. A string input is one entry. */
export function handsOffToInputList(input: HandsOffToInput): string[] {
  const raw: readonly string[] = typeof input === "string" ? [input] : input;
  const out: string[] = [];
  for (const item of raw) {
    const t = item.trim();
    if (t !== "" && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * A full http(s) address is returned unchanged. An unknown form is returned
 * unchanged (the save refuses it before a write). A bare id is joined onto
 * the holding record's address, replacing the last segment.
 * No slash on the holder, or an empty input, returns the trimmed input.
 */
export function resolveHandsOffToUri(host: HandsOffHost, input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return trimmed;
  if (/^https?:\/\//i.test(trimmed) || isHandsOffAddressUnknown(trimmed)) return trimmed;
  const hostId = typeof host["@id"] === "string" ? host["@id"] : "";
  const marker = hostId.lastIndexOf("/");
  if (marker === -1) return trimmed;
  return `${hostId.slice(0, marker + 1)}${trimmed}`;
}

/** The identity of a link: a full address, or a bare id resolved against the holder. An unknown form is itself. */
export function handsOffLinkKey(host: HandsOffHost, link: string): string {
  const t = link.trim();
  if (isHandsOffAddressUnknown(t)) return t;
  return resolveHandsOffToUri(host, t);
}

function linkKeys(host: HandsOffHost, links: readonly string[]): string[] {
  return links.map((link) => handsOffLinkKey(host, link));
}

function sameLinks(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** True when the editor list is the served list, same links, same order. */
export function handsOffToUnchanged(
  host: HandsOffHost,
  input: HandsOffToInput,
  servedIds: readonly string[],
): boolean {
  return sameLinks(linkKeys(host, handsOffToInputList(input)), linkKeys(host, servedIds));
}

/**
 * What a changed list should write. Null means unchanged: omit the field.
 * Throws {@link HandsOffToUnreadableError} when the served value has a member
 * this reader cannot read. Throws {@link HandsOffToUnknownAddressError} when
 * any link, kept or added, is an unknown address.
 * A kept link is written as it was served. An added bare id is resolved.
 */
export function planHandsOffToSave(
  host: HandsOffHost,
  served: HandsOffToReading,
  input: HandsOffToInput,
): HandsOffToSavePlan | null {
  if (handsOffToUnchanged(host, input, served.ids)) return null;
  if (served.unreadable > 0) throw new HandsOffToUnreadableError(served.unreadable);
  const servedByKey = new Map<string, string>();
  for (const id of served.ids) {
    const key = handsOffLinkKey(host, id);
    if (!servedByKey.has(key)) servedByKey.set(key, id);
  }
  const write: string[] = [];
  const added: string[] = [];
  const seen = new Set<string>();
  for (const link of handsOffToInputList(input)) {
    const key = handsOffLinkKey(host, link);
    if (key === "" || seen.has(key)) continue;
    if (isHandsOffAddressUnknown(key)) throw new HandsOffToUnknownAddressError(key);
    seen.add(key);
    const kept = servedByKey.get(key);
    if (kept !== undefined) {
      write.push(kept);
    } else {
      const resolved = resolveHandsOffToUri(host, link);
      write.push(resolved);
      added.push(resolved);
    }
  }
  return { write, added };
}

/** A copy of `links` plus `link`, unless that link is already there. Blank adds nothing. */
export function addHandoffLink(hostUri: string, links: readonly string[], link: string): string[] {
  const t = link.trim();
  if (t === "") return [...links];
  const host: HandsOffHost = { "@id": hostUri };
  const key = handsOffLinkKey(host, t);
  return links.some((item) => handsOffLinkKey(host, item) === key) ? [...links] : [...links, t];
}

/** A copy without the link that IS `link`. A different host with the same tail stays. */
export function removeHandoffLink(hostUri: string, links: readonly string[], link: string): string[] {
  const host: HandsOffHost = { "@id": hostUri };
  const key = handsOffLinkKey(host, link);
  return links.filter((item) => handsOffLinkKey(host, item) !== key);
}

/** The list a save should write, including a link still sitting in the add box. */
export function handoffLinksToSave(
  hostUri: string,
  links: readonly string[],
  draft: string,
): string[] {
  return draft.trim() === "" ? [...links] : addHandoffLink(hostUri, links, draft);
}
