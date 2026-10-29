// The WRITE side of the link between a holder's record of a person and that person's own online card: the existing `sameAs` fact,
// written by the holder only, on the holder's own record. It grants nothing. This file says what the one patch that makes or removes
// the link may contain; the write itself is the app's (its authenticated merge patch on the holder's own record).

/** The link's slug on the record, as the apps address it. The app's writer maps it to the vault's stored spelling. */
export const LINK_SLUG = "sameAs";

/** The write was refused before anything was sent. */
export class LinkRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkRefusedError";
  }
}

/** A merge patch (RFC 7386) for the holder's own record: only the link's slug, a reference or `null`. */
export interface LinkWrite {
  record: string;
  patch: Record<typeof LINK_SLUG, { "@id": string } | null>;
}

function isAbsoluteHttp(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && u.host !== "";
  } catch {
    return false;
  }
}

/**
 * The write that links a record to a party's online card. The target is the party's identity address (what the
 * resolver follows, through the entity redirect, to the card's key). ⛔ Nothing but `a:sameAs` is in the patch.
 *
 * @throws LinkRefusedError for a missing record, a target that is not an absolute http(s) address, or a record linked to itself
 */
export function linkWrite(args: { record: string; target: string }): LinkWrite {
  const record = args.record?.trim() ?? "";
  const target = args.target?.trim() ?? "";
  if (!record) throw new LinkRefusedError("Refusing to link: no record is named.");
  if (!isAbsoluteHttp(target)) throw new LinkRefusedError("Refusing to link: the card to link to is not an address.");
  if (target === record) throw new LinkRefusedError("Refusing to link a record to itself.");
  return { record, patch: { [LINK_SLUG]: { "@id": target } } };
}

/** The write that removes the link: it retracts `a:sameAs` alone. Nothing else on the record, and no rung, is touched. */
export function unlinkWrite(args: { record: string }): LinkWrite {
  const record = args.record?.trim() ?? "";
  if (!record) throw new LinkRefusedError("Refusing to unlink: no record is named.");
  return { record, patch: { [LINK_SLUG]: null } };
}
