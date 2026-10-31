// What the held card's Skills and Interests sections need of the platform beyond `test/languagesWorld.ts`: the master's terms of a held skill note and a held
// interest (`skillDepthNote`, `topicInterest`, `topicInterestNote`), and `fieldMeta` (the record's sidecar of the Skills rows: the name a picked skill carries, and where a pick or a removal is saved) and the ontology's own documents of two catalogue terms, `t/Welding` and `t/Photography`,
// whose `a:label` is the name an interest is shown by. Only the master is filled here; the claims and the record are seeded by the test.
import { CONTEXT, a, t } from "./support";
import type { World } from "./world";

export const WELDING = t("Welding");
export const PHOTOGRAPHY = t("Photography");

export function addSkillTerms(world: World): void {
  for (const slug of ["fieldMeta", "skillDepthNote", "topicInterest", "topicInterestNote"]) world.master.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  world.master.put("t/Welding", { "@context": CONTEXT, "@id": WELDING, "a:label": "welding" });
  world.master.put("t/Photography", { "@context": CONTEXT, "@id": PHOTOGRAPHY, "a:label": "photography" });
}
