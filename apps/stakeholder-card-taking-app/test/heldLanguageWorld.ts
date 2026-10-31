// What the held card's Languages section needs of the app's test world: the master's terms of a held language claim and the two person fields the card needs to draw its
// Languages (Skill, Contact Language), and a held language claim about the record that "+ Add your own" makes: the wrapper watches for the create of the person and,
// when the platform has answered it, seeds one claim about that new record (stated by Ann's own card, Norwegian, with its country as the flag). Fakes only.
import { CONTEXT, RIG, a, t } from "./support";
import { HOST, P, type World } from "./world";
import { COUNTRY_NO, LANGUAGE_NO } from "./languageWorld";

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
  for (const slug of ["skill", "contactLanguage", "heldParty", "statedBy", "languageUsed", "flagCountry"]) world.master.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  world.master.put("t/HeldPartyFieldClaim", { "@context": CONTEXT, "@id": t("HeldPartyFieldClaim"), "a:typeAttribute": "t:HeldPartyFieldClaim" });
}

/** Seeds a held Norwegian claim about each person the app creates in Ann's vault, right after the platform answers the create. */
export function withHeldLanguageOnNewRecord(next: typeof fetch, worldOf: () => World): typeof fetch {
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await next(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url === `${HOST}/lws/vault/${encodeURIComponent(P)}/c` && res.ok) {
      const body = JSON.parse(String(init?.body)) as { type?: string };
      const loc = res.headers.get("location") ?? ((await res.clone().json()) as { "@id"?: string })["@id"] ?? "";
      if (body.type === "t:Person" && loc) {
        const world = worldOf();
        world.platform.seed(P, "t:HeldPartyFieldClaim", {
          "a:heldParty": { "@id": `${HOST}/base/e/${loc.slice(loc.lastIndexOf("/") + 1)}` },
          "a:languageUsed": { "@id": LANGUAGE_NO },
          "a:statedBy": { "@id": world.ownCardUri! },
          "a:flagCountry": { "@id": COUNTRY_NO },
        });
      }
    }
    return res;
  };
  return f as typeof fetch;
}
