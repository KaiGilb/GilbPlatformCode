// Ported from the source's personName test (4 of its 8 cases; the other four test `joinPersonName` (unit `plan-self-source`)
// and `termName` / `fieldOfTerm` (unit `stakeholder-card-model`), see the README). New cases follow the ported ones.
import { describe, expect, it } from "vitest";
import { personCardFields, personCardOrder, personSectionOrder, splitPersonName } from "./personName";

const slugs = (xs: readonly { slug: string }[]) => xs.map((x) => x.slug);
const fieldsOf = (...s: string[]) => s.map((slug) => ({ slug }));

describe("person name, MyNet's way (ported)", () => {
  it("splits a one-name record as MyNet: first word is the first name, the rest the last name", () => {
    expect(splitPersonName("Jason Test")).toEqual({ given: "Jason", family: "Test" });
    expect(splitPersonName("Anna Maria  Berg")).toEqual({ given: "Anna", family: "Maria Berg" });
    expect(splitPersonName("Plato")).toEqual({ given: "Plato", family: "" });
    expect(splitPersonName(null)).toEqual({ given: "", family: "" });
  });
  it("orders given, family, then the rest; hides the named boxes", () => {
    const f = fieldsOf("contactLanguage", "email", "fam", "giv", "name", "phone");
    expect(slugs(personCardOrder(f, "giv", "fam", ["name"]))).toEqual(["giv", "fam", "contactLanguage", "email", "phone"]);
  });
  it("with a nickname slug, orders given, family, nickname, then the rest; without it, the order is unchanged", () => {
    const f = fieldsOf("contactLanguage", "email", "fam", "giv", "name", "nick", "phone");
    expect(slugs(personCardOrder(f, "giv", "fam", ["name"], "nick"))).toEqual(["giv", "fam", "nick", "contactLanguage", "email", "phone"]);
    expect(slugs(personCardOrder(f, "giv", "fam", ["name"]))).toEqual(["giv", "fam", "contactLanguage", "email", "nick", "phone"]);
  });
});

describe("a person card's sections stay after the leading names (ported)", () => {
  it("keeps three leading names when a nickname slug is passed, and two when it is not", () => {
    const ordered = fieldsOf("giv", "fam", "nick", "job", "phone", "email", "note");
    const sections = fieldsOf("email", "phone");
    expect(slugs(personSectionOrder(ordered, sections, "nick"))).toEqual(["giv", "fam", "nick", "email", "phone", "job", "note"]);
    expect(slugs(personSectionOrder(ordered, sections))).toEqual(["giv", "fam", "email", "phone", "nick", "job", "note"]);
  });
});

describe("splitPersonName, more", () => {
  it("an empty, blank or missing name is two empty boxes", () => {
    for (const v of ["", "   ", "\t\n", undefined, null]) expect(splitPersonName(v)).toEqual({ given: "", family: "" });
  });
  it("trims the ends and collapses every run of white space (tab, newline) to one space", () => {
    expect(splitPersonName("  Anna \t Maria\n Berg  ")).toEqual({ given: "Anna", family: "Maria Berg" });
  });
  it("two words are given and family; the family keeps every further word, one space apart", () => {
    expect(splitPersonName("Jason Test")).toEqual({ given: "Jason", family: "Test" });
    expect(splitPersonName("Ludwig van der Heyden")).toEqual({ given: "Ludwig", family: "van der Heyden" });
  });
  it("a single word with white space around it is the given name only", () => {
    expect(splitPersonName("  Plato  ")).toEqual({ given: "Plato", family: "" });
  });
});

describe("personCardOrder, more", () => {
  const f = fieldsOf("email", "fam", "giv", "name", "photo", "nick");
  it("a missing given or family field is left out, and the rest keep their order", () => {
    expect(slugs(personCardOrder(fieldsOf("email", "fam"), "giv", "fam", []))).toEqual(["fam", "email"]);
    expect(slugs(personCardOrder(fieldsOf("email", "giv"), "giv", "fam", []))).toEqual(["giv", "email"]);
    expect(slugs(personCardOrder(fieldsOf("email", "phone"), "giv", "fam", []))).toEqual(["email", "phone"]);
  });
  it("every hidden slug is dropped; a null or undefined entry in `hidden` is ignored", () => {
    expect(slugs(personCardOrder(f, "giv", "fam", ["name", null, "photo", undefined]))).toEqual(["giv", "fam", "email", "nick"]);
  });
  it("a hidden slug that no field has changes nothing", () => {
    expect(slugs(personCardOrder(f, "giv", "fam", ["zzz"]))).toEqual(["giv", "fam", "email", "name", "photo", "nick"]);
  });
  it("a nickname slug that no field has, a null one and an empty one leave the order as without it", () => {
    const plain = slugs(personCardOrder(f, "giv", "fam", ["name"]));
    for (const n of ["nope", null, ""]) expect(slugs(personCardOrder(f, "giv", "fam", ["name"], n))).toEqual(plain);
  });
  it("a nickname is shown once, in third place, even when it is also listed as hidden", () => {
    expect(slugs(personCardOrder(f, "giv", "fam", ["nick"], "nick"))).toEqual(["giv", "fam", "nick", "email", "name", "photo"]);
  });
  it("the given and family fields are never shown a second time", () => {
    const out = slugs(personCardOrder(f, "giv", "fam", []));
    expect(out.filter((s) => s === "giv")).toHaveLength(1);
    expect(out.filter((s) => s === "fam")).toHaveLength(1);
  });
  it("returns the same field objects (with their other properties), and does not change its input", () => {
    const input = [{ slug: "b", label: "B" }, { slug: "giv", label: "G" }, { slug: "fam", label: "F" }];
    const copy = JSON.stringify(input);
    const out = personCardOrder(input, "giv", "fam", []);
    expect(out[0]).toBe(input[1]);
    expect(out[1]).toBe(input[2]);
    expect(out[2]).toBe(input[0]);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe("personSectionOrder, more", () => {
  it("a field a section stands for is dropped from the rest, and the sections come in the order given", () => {
    const ordered = fieldsOf("giv", "fam", "social", "phone", "email", "job");
    const out = slugs(personSectionOrder(ordered, fieldsOf("email", "phone", "social")));
    expect(out).toEqual(["giv", "fam", "email", "phone", "social", "job"]);
  });
  it("no sections: the fields stay as they were", () => {
    const ordered = fieldsOf("giv", "fam", "a", "b");
    expect(slugs(personSectionOrder(ordered, []))).toEqual(["giv", "fam", "a", "b"]);
  });
  it("an empty nickname slug keeps the lead at two", () => {
    const ordered = fieldsOf("giv", "fam", "nick", "job");
    expect(slugs(personSectionOrder(ordered, fieldsOf("email"), ""))).toEqual(["giv", "fam", "email", "nick", "job"]);
    expect(slugs(personSectionOrder(ordered, fieldsOf("email"), null))).toEqual(["giv", "fam", "email", "nick", "job"]);
  });
  it("a section keeps its own object", () => {
    const email = { slug: "email", label: "Email" };
    expect(personSectionOrder(fieldsOf("giv", "fam"), [email])[2]).toBe(email);
  });
});

describe("personCardFields", () => {
  it("MyNet's sections follow the names; the other fields follow them, in the master's order", () => {
    const ordered = fieldsOf("giv", "fam", "job", "email", "phone", "note");
    const out = personCardFields(ordered, fieldsOf("email", "phone"), []);
    expect(slugs(out)).toEqual(["giv", "fam", "email", "phone", "job", "note"]);
  });
  it("a late section whose field is among the others stays where that field sits (it is not moved up)", () => {
    const ordered = fieldsOf("giv", "fam", "job", "lang", "note");
    const out = personCardFields(ordered, fieldsOf("email"), fieldsOf("lang"));
    expect(slugs(out)).toEqual(["giv", "fam", "email", "job", "lang", "note"]);
  });
  it("a late section whose field is not among the fields follows them all, and is never dropped", () => {
    const ordered = fieldsOf("giv", "fam", "job");
    const late = { slug: "lang", label: "Language" };
    const out = personCardFields(ordered, fieldsOf("email"), [late]);
    expect(slugs(out)).toEqual(["giv", "fam", "email", "job", "lang"]);
    expect(out[4]).toBe(late);
  });
  it("a late section whose field is among the fields is not drawn twice", () => {
    const ordered = fieldsOf("giv", "fam", "lang");
    expect(slugs(personCardFields(ordered, [], fieldsOf("lang"))).filter((s) => s === "lang")).toHaveLength(1);
  });
  it("two late sections: one with its field present, one without", () => {
    const ordered = fieldsOf("giv", "fam", "a");
    const out = slugs(personCardFields(ordered, [], fieldsOf("a", "z")));
    expect(out).toEqual(["giv", "fam", "a", "z"]);
  });
  it("uses the lead of two (no nickname)", () => {
    const ordered = fieldsOf("giv", "fam", "nick", "email");
    expect(slugs(personCardFields(ordered, fieldsOf("email"), []))).toEqual(["giv", "fam", "email", "nick"]);
  });
});
