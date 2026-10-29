// Cycle214 s8 organization card — the field order of an organization card (one name box, not a given and a family name).
import { describe, expect, it } from "vitest";
import { orgSectionOrder } from "./orgCardOrder";
import { personSectionOrder } from "../test/personSectionOrder";

const f = (slug: string) => ({ slug });
const fields = ["contactLanguage", "email", "name", "phone", "timeZone", "url"].map(f);
const sections = ["email", "phone", "account"].map(f);

describe("orgSectionOrder", () => {
  it("puts the name box first, then the sections, then the rest in the master's order, each field once", () => {
    expect(orgSectionOrder(fields, "name", sections).map((x) => x.slug)).toEqual(["name", "email", "phone", "account", "contactLanguage", "timeZone", "url"]);
  });
  it("a card with no name field starts with the sections", () => {
    expect(orgSectionOrder(fields.filter((x) => x.slug !== "name"), null, sections).map((x) => x.slug)).toEqual(["email", "phone", "account", "contactLanguage", "timeZone", "url"]);
  });
  it("is the reason it exists: the person's order, given an organization's fields, would draw a section twice", () => {
    const wrong = personSectionOrder(fields, sections).map((x) => x.slug);
    expect(wrong.filter((s) => s === "email").length).toBeGreaterThan(0);
    expect(new Set(wrong).size).toBeLessThan(wrong.length); // email is in the 'names' slice and in the sections
  });
});
