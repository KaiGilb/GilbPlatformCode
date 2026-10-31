// What the held card's Languages section needs of the platform beyond `test/world.ts`: the master's terms of a held language claim (`heldParty`, `statedBy`,
// `languageUsed`, `flagCountry`, the type `HeldPartyFieldClaim`), the language catalogue's entries (read at their own address, on the ontology origin the provider sets)
// and the geo catalogue's two small flag files. A country ENTITY is never served: a test fails if one is asked for. Only GETs are answered here; every write is the
// world's and is logged in `world.calls`.
import { CONTEXT, ID, RIG, a, t } from "./support";
import { GEO, type World } from "./world";

export const NORWEGIAN = `${ID}/base/e/langnorwegian`;
export const ENGLISH = `${ID}/base/e/langenglish`;
export const NORWAY = `${GEO}/base/e/osm-r-2978650`;
export const UK = `${GEO}/base/e/osm-r-62149`;
export const USA = `${GEO}/base/e/osm-r-148838`;
const FLAG_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';
const ENTRIES: Record<string, { label: string; iso6393Code: string; countries: string[] }> = {
  [NORWEGIAN]: { label: "Norwegian", iso6393Code: "nor", countries: [NORWAY] },
  [ENGLISH]: { label: "English", iso6393Code: "eng", countries: [UK, USA] },
};
const FLAGS: Record<string, string> = { "flag-osm-r-2978650": "no" };

/**
 * Put into the world's master the terms of a held language claim, and the two fields of a person the card needs to draw its Languages: the Skill field (the card
 * draws Languages beside its Skills) and the Contact Language field (the record's own `a:contactLanguage`, which the card writes through `writeContact`).
 */
export function addLanguageTerms(world: World): void {
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = world.master.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(page["@graph"]);
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  const person = [{ "@id": t("Person") }];
  pages[pages.length - 1]!.push(
    { "@id": t("Skill"), "a:predicateAttribute": "a:skill", "a:label": "Skill", "a:encoding": "reference-valued:@id", "a:fieldOf": person },
    { "@id": t("ContactLanguage"), "a:predicateAttribute": "a:contactLanguage", "a:label": "Contact language", "a:encoding": "inline-literal:text", "a:fieldOf": person },
  );
  world.master.listing(pages as never);
  for (const slug of ["skill", "contactLanguage"]) world.master.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  for (const slug of ["heldParty", "statedBy", "languageUsed", "flagCountry"]) world.master.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  world.master.put("t/HeldPartyFieldClaim", { "@context": CONTEXT, "@id": t("HeldPartyFieldClaim"), "a:typeAttribute": "t:HeldPartyFieldClaim" });
}

export interface LanguagesWorld {
  fetch: typeof fetch;
  /** Every request the entries and the geo files were asked for. */
  asked: { method: string; url: string }[];
  /** The country entities that were asked for (must stay empty). */
  countryEntityAsks: string[];
}

export function languagesWorld(next: typeof fetch): LanguagesWorld {
  const asked: LanguagesWorld["asked"] = [];
  const countryEntityAsks: string[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const entry = ENTRIES[url];
    if (entry) {
      asked.push({ method, url });
      return json(200, { "@id": url, label: entry.label, iso6393Code: entry.iso6393Code, languageCountry: entry.countries.map((c) => ({ "@id": c })) });
    }
    if (url.startsWith(`${GEO}/`)) {
      asked.push({ method, url });
      const flag = /^https:\/\/geo\.example\.test\/(files|base\/e)\/(flag-[a-z0-9-]+)$/.exec(url);
      if (!flag) {
        countryEntityAsks.push(url);
        return json(500, { error: "a country entity must never be asked for" });
      }
      const code = FLAGS[flag[2]!];
      if (code === undefined) return json(404, { error: "NotFound" });
      return flag[1] === "files" ? new Response(FLAG_SVG, { status: 200, headers: { "content-type": "image/svg+xml" } }) : json(200, { fileTag: ["flag", code] });
    }
    return next(input, init);
  };
  return { fetch: f as typeof fetch, asked, countryEntityAsks };
}
