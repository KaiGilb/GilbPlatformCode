// What the held card's Employment section needs of the app's test world: the master's terms of an employment entity (`org`, `claimSlotKey`, `name`, `startDate`, `endDate`,
// `ongoing`, `workLocation`; `jobTitle`, `employer`, `employee` and `t/Employment` are there already; the Employment field of a person is in the tag fixture), and, for the
// record that "+ Add your own" makes: two employments (one running, with a stored work place the held card does not draw; one ended, with two titles) and the person's edges to
// them. The wrapper watches for the create of the person and, when the platform has answered it, makes the employments and edits the new record. Fakes only.
import { CONTEXT, a } from "./support";
import { HOST, P, type World } from "./world";

export const WORK_PLACE = "https://geo.example.test/base/e/osm-r-2775550";

export function addEmploymentTerms(world: World): void {
  for (const slug of ["org", "claimSlotKey", "name", "startDate", "endDate", "ongoing", "workLocation"]) world.master.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
}

/** The employments each person the app creates in Ann's vault is given, and their entities (filled in as they are made). */
export const seededEmployments: { running: string; ended: string }[] = [];

export function withHeldEmploymentsOnNewRecord(next: typeof fetch, worldOf: () => World): typeof fetch {
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await next(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url === `${HOST}/lws/vault/${encodeURIComponent(P)}/c` && res.ok) {
      const body = JSON.parse(String(init?.body)) as { type?: string };
      const loc = res.headers.get("location") ?? ((await res.clone().json()) as { "@id"?: string })["@id"] ?? "";
      if (body.type === "t:Person" && loc) {
        const world = worldOf();
        const id = loc.slice(loc.lastIndexOf("/") + 1);
        const running = world.platform.seed(P, "t:Employment", { "a:org": "Acme AS", "a:jobTitle": "Welder", "a:startDate": "2019-03", "a:ongoing": true, "a:workLocation": { "@id": WORK_PLACE } });
        const ended = world.platform.seed(P, "t:Employment", { "a:org": "Beta Holding", "a:jobTitle": ["Chair", "Founder"], "a:startDate": "2012-05", "a:endDate": "2018-12" });
        seededEmployments.push({ running, ended });
        world.platform.edit(`${HOST}/base/e/${id}`, { "a:employment": [{ "@id": running }, { "@id": ended }] });
      }
    }
    return res;
  };
  return f as typeof fetch;
}
