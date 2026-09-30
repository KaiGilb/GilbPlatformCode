import { describe, expect, it } from "vitest";
import { thinSkillsPathFor } from "./catalogPath";

describe("thinSkillsPathFor", () => {
  it("adds a missing trailing slash and does not add a leading one", () => {
    expect(thinSkillsPathFor("/")).toBe("/data/thin-skills.json");
    expect(thinSkillsPathFor("/mynet/")).toBe("/mynet/data/thin-skills.json");
    expect(thinSkillsPathFor("/mynet")).toBe("/mynet/data/thin-skills.json");
    expect(thinSkillsPathFor("mynet")).toBe("mynet/data/thin-skills.json");
    expect(thinSkillsPathFor("")).toBe("/data/thin-skills.json");
    expect(thinSkillsPathFor("/mynet//")).toBe("/mynet//data/thin-skills.json");
  });
});
