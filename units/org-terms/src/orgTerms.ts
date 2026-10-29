// The master's spellings of the organization's own terms, ASKED by term name
// (`term-slots`), as every other spelling is. ⛔ No spelling is typed here; a master that does not
// answer makes the part unavailable (fail CLOSED), never a guessed key. Cached on success only.
//
// The terms (Suggested, no find key on any): `a:logo` (a link to a `t:ImageFile` in the same vault),
// `a:parentOrganization` (one direct parent, acyclic, read-only for the platform: the writer checks), `a:employer`
// (on the employment, to the organization record). `a:registrationNumber` and `a:registrationRegister` ride on a
// held claim.
import { attributeSpelling } from "@kaigilb/gilbplatformcode-term-slots";

export class OrgTermsUnavailableError extends Error {
  constructor(missing: readonly string[]) {
    super(`The ontology did not name ${missing.join(", ")}, so this part of the organization card is not available right now.`);
    this.name = "OrgTermsUnavailableError";
  }
}

/** The master's BARE spelling of each term (the form `patchRecord` and a read of `readRecord().facts` use). */
export interface OrgTerms {
  logo: string;
  parentOrganization: string;
  employer: string;
}

let cached: Promise<OrgTerms> | null = null;

/** Test seam: ⛔ never called by product code. */
export function __resetOrgTerms(): void {
  cached = null;
}

export function resolveOrgTerms(): Promise<OrgTerms> {
  cached ??= (async () => {
    const names = ["logo", "parentOrganization", "employer"] as const;
    const spelled = await Promise.all(names.map((n) => attributeSpelling(n)));
    const missing = names.filter((_, i) => !spelled[i]);
    if (missing.length > 0) throw new OrgTermsUnavailableError(missing.map((n) => `a/${n}`));
    return { logo: spelled[0]!, parentOrganization: spelled[1]!, employer: spelled[2]! };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

/** One value of a served fact as the addresses it holds: a string, an `{"@id"}`, or an array of either. */
export function refsOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string" ? (x as { "@id": string })["@id"].trim() : ""))
    .filter((x) => x !== "");
}

/** A served document's value under a stored/bare key, read under either spelling (Base frames one `a:` off). */
export function servedValue(doc: Record<string, unknown>, bare: string): unknown {
  return doc[bare] ?? doc[`a:${bare}`];
}
