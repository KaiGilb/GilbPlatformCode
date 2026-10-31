// Test-only. The employment vocabulary as the master names it (the term names, `a:`-prefixed) and the link spellings.
import type { ResolvedEmploymentVocab } from "@kaigilb/gilbplatformcode-employment-vocab";

export const vocab = {
  org: "a:org",
  jobTitle: "a:jobTitle",
  claimSlotKey: "a:claimSlotKey",
  name: "a:name",
  employmentType: "t:Employment",
  employmentTypeQuery: "Employment",
  employment: "a:employment",
  startDate: "a:startDate",
  endDate: "a:endDate",
  ongoing: "a:ongoing",
  workLocation: "a:workLocation",
} as ResolvedEmploymentVocab;
export const linkVocab = { employer: "a:employer", employee: "a:employee" };
export const GEO = "https://geo.platform.example.test";
export const OSLO = `${GEO}/base/e/osm-r-2775550`;
