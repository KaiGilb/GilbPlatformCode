import { describe, expect, it } from "vitest";
import { groupSkillsByParent, searchSkills, skillParentLabel } from "./skillBrowse";
import type { BrowseSkill } from "./skillBrowse";

const skills: BrowseSkill[] = [
  { tag: "Baking", uri: "storage-baking", does: "Heat food", parentLabel: "Kitchen" },
  { tag: "Baker", uri: "storage-baker", does: "A person", path: ["Work", ""] },
  { tag: "Zz", uri: "storage-zz", does: "mentions baking once" },
];

describe("skillParentLabel", () => {
  it("uses the parent, else only the last path entry, else Skills", () => {
    const baking = skills.find((skill) => skill.tag === "Baking");
    const baker = skills.find((skill) => skill.tag === "Baker");
    expect(baking).toBeTruthy();
    expect(baker).toBeTruthy();
    expect(skillParentLabel(baking!)).toBe("Kitchen");
    expect(skillParentLabel(baker!)).toBe("Skills");
    expect(skillParentLabel({ tag: "A", uri: "a", path: ["Root", "Leaf"] })).toBe("Leaf");
    expect(skillParentLabel({ tag: "A", uri: "a", parentLabel: "  " })).toBe("Skills");
  });
});

describe("searchSkills", () => {
  it("ranks a shorter tag ahead on a tie, keeps a zero limit, and does not reorder the input", () => {
    const before = skills.map((skill) => skill.tag);
    const hits = searchSkills(skills, "  bak ");
    expect(hits.map((skill) => skill.tag)).toEqual(["Baker", "Baking", "Zz"]);
    expect(hits[0]).toBe(skills.find((skill) => skill.tag === "Baker"));
    expect(skills.map((skill) => skill.tag)).toEqual(before);
    expect(searchSkills(skills, "bak", { excludeUris: new Set(["storage-baking"]) }).map((s) => s.tag)).toEqual([
      "Baker",
      "Zz",
    ]);
    expect(searchSkills(skills, "")).toEqual([]);
    expect(searchSkills(skills, "bak", { limit: 0 })).toEqual([]);
    expect(searchSkills(skills, "skills").map((skill) => skill.tag)).toEqual(["Zz", "Baker"]);
  });
});

describe("groupSkillsByParent", () => {
  it("groups under the heading and sorts headings and tags", () => {
    const groups = groupSkillsByParent(skills, new Set(["storage-zz"]));
    expect(groups.map((group) => group.parent)).toEqual(["Kitchen", "Skills"]);
    expect(groups[1]?.skills.map((skill) => skill.tag)).toEqual(["Baker"]);
  });
});
