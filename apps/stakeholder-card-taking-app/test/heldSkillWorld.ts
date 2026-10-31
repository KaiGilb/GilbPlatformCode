// What the held card's Skills and Interests need of the app's test world: the master's terms of a held skill note and a held interest (and the record's sidecar,
// `fieldMeta`), two catalogue terms with their labels, and, for the record that "+ Add your own" makes: the person's skill (Welding, with its sidecar entry), one
// held note on that skill and one held interest with its note, all stated by Ann's own card. The wrapper watches for the create of the person and, when the platform has
// answered it, edits the new record and seeds the claims about it. Fakes only.
import { CONTEXT, a, t } from "./support";
import { HOST, P, type World } from "./world";

export const WELDING = t("Welding");
export const PHOTOGRAPHY = t("Photography");

export function addSkillTerms(world: World): void {
  for (const slug of ["fieldMeta", "skillDepthNote", "topicInterest", "topicInterestNote"]) world.master.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  world.master.put("t/Welding", { "@context": CONTEXT, "@id": WELDING, "a:label": "welding" });
  world.master.put("t/Photography", { "@context": CONTEXT, "@id": PHOTOGRAPHY, "a:label": "photography" });
}

/** Gives each person the app creates in Ann's vault a skill, a note on it and an interest with a note, right after the platform answers the create. */
export function withHeldSkillsOnNewRecord(next: typeof fetch, worldOf: () => World): typeof fetch {
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await next(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url === `${HOST}/lws/vault/${encodeURIComponent(P)}/c` && res.ok) {
      const body = JSON.parse(String(init?.body)) as { type?: string };
      const loc = res.headers.get("location") ?? ((await res.clone().json()) as { "@id"?: string })["@id"] ?? "";
      if (body.type === "t:Person" && loc) {
        const world = worldOf();
        const id = loc.slice(loc.lastIndexOf("/") + 1);
        const about = { "@id": `${HOST}/base/e/${id}` };
        world.platform.edit(about["@id"], { "a:skill": [{ "@id": WELDING }], "a:fieldMeta": { skill: { type: "skill", label: "welding", order: 7, access: "private", valueIndex: 0 } } });
        world.platform.seed(P, "t:HeldPartyFieldClaim", { "a:heldParty": about, "a:skill": { "@id": WELDING }, "a:skillDepthNote": "TIG, six years", "a:statedBy": { "@id": world.ownCardUri! } });
        world.platform.seed(P, "t:HeldPartyFieldClaim", { "a:heldParty": about, "a:topicInterest": { "@id": PHOTOGRAPHY }, "a:topicInterestNote": "Long exposures", "a:statedBy": { "@id": world.ownCardUri! } });
      }
    }
    return res;
  };
  return f as typeof fetch;
}
