// An employment that names an organization RECORD carries two single links, `a:employer` (to the organization record)
// and `a:employee` (to the person), written TOGETHER with `a:org` (the name). Pure.
//
// Neither link declares a find key, and nothing here writes a rung or a claim subject. An employment with a name and no
// link stays valid and is simply not on an organization's employees list.
//
// The spellings are the master's answer to the term names, ASKED by the caller (`resolveEmploymentLinkVocab` of
// `org-terms`); none is typed here.
import type { EmploymentLinkVocab } from "@kaigilb/gilbplatformcode-org-terms";

const ENTITY_ADDRESS = /^https?:\/\/[^/\s]+\/(?:base\/e|vault\/e|lws\/r)\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const entityTail = (u: string) => u.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";

/** The two link facts of one employment, or `{}` when no organization record was chosen. Both or neither. */
export function employmentLinkFacts(
  vocab: EmploymentLinkVocab,
  links: { employer?: string | null; employee?: string | null },
): Record<string, { "@id": string }> {
  const employer = (links.employer ?? "").trim();
  const employee = (links.employee ?? "").trim();
  if (!employer && !employee) return {};
  if (!employer || !employee) throw new Error("Refusing to write an employer without an employee (or the reverse): the two links are written together.");
  if (!ENTITY_ADDRESS.test(employer)) throw new Error(`Refusing to write an employer that is not an entity address: ${JSON.stringify(employer)}.`);
  if (!ENTITY_ADDRESS.test(employee)) throw new Error(`Refusing to write an employee that is not an entity address: ${JSON.stringify(employee)}.`);
  if (entityTail(employer) === entityTail(employee)) throw new Error("Refusing to write an employment whose employer and employee are the same record.");
  return { [vocab.employer]: { "@id": employer }, [vocab.employee]: { "@id": employee } };
}
