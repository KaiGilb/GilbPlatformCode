// What the held card's Address section needs of the platform beyond `test/geoWorld.ts`: the ontology's answers for the address terms (the spelling of each attribute and
// type the section reads and writes, and a label for the lines), so `place-vocab` resolves. Everything else is passed on.
import { ONTOLOGY } from "./world";

const ATTRS = ["placeClaimLabel", "streetLine", "memberOf", "claimSubject", "claimPlace", "detailOf", "addressLine1", "addressLine2", "postalCode"];
const LABELS: Record<string, string> = { addressLine1: "Address 1", addressLine2: "Address 2", postalCode: "Postal Code" };
const TYPES = ["PlaceClaim", "SelfAssertedFieldClaim"];

export function placeWorld(next: typeof fetch): typeof fetch {
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const a = new RegExp(`^${ONTOLOGY.replace(/[.]/g, "\\.")}/base/a/([A-Za-z0-9]+)$`).exec(url);
    if (a && ATTRS.includes(a[1]!)) {
      return Response.json({ "@id": url, "a:predicateAttribute": `a:${a[1]}`, ...(LABELS[a[1]!] ? { "a:label": LABELS[a[1]!] } : {}) });
    }
    const t = new RegExp(`^${ONTOLOGY.replace(/[.]/g, "\\.")}/base/t/([A-Za-z0-9]+)$`).exec(url);
    if (t && TYPES.includes(t[1]!)) return Response.json({ "@id": url, "a:typeAttribute": `t:${t[1]}` });
    return next(input, init);
  };
  return f as typeof fetch;
}
