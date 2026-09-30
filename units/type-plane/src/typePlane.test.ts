import { describe, expect, it } from "vitest";
import { classifyPlane, isCreatePlane, isIssuedOnTypeFind } from "./typePlane";

describe("classifyPlane", () => {
  it("calls an empty fact map an entity", () => {
    expect(classifyPlane({})).toBe("entity");
  });

  it("takes the first match, so a relation kind beats a later function fact", () => {
    expect(classifyPlane({ "a:nodeKind": "relation", "a:verb": "links" })).toBe("relation");
  });

  it("treats isRelationPredicate as relation only when the value is boolean true", () => {
    expect(classifyPlane({ "a:isRelationPredicate": true })).toBe("relation");
    expect(classifyPlane({ "a:isRelationPredicate": "true" })).toBe("entity");
    expect(classifyPlane({ "a:isRelationPredicate": 1 })).toBe("entity");
  });

  it("does not treat a t: predicateAttribute as an attribute", () => {
    expect(classifyPlane({ "a:predicateAttribute": "t:NoteDocument" })).toBe("entity");
    expect(classifyPlane({ "a:predicateAttribute": { "@id": "t:Task" } })).toBe("entity");
  });

  it("treats an a: or skos: predicateAttribute as an attribute, including an @id object", () => {
    expect(classifyPlane({ "a:predicateAttribute": "a:phone" })).toBe("attribute");
    expect(classifyPlane({ "a:predicateAttribute": "skos:prefLabel" })).toBe("attribute");
    expect(classifyPlane({ "a:predicateAttribute": { "@id": "a:name" } })).toBe("attribute");
  });

  it("treats a present value marker as a value even when the value is null", () => {
    expect(classifyPlane({ "a:scale": null })).toBe("value");
  });

  it("does not treat a:providesFunction as a function", () => {
    expect(classifyPlane({ "a:providesFunction": "t:Rule" })).toBe("entity");
  });

  it("treats a present a:verb as a function even when the verb is null", () => {
    expect(classifyPlane({ "a:verb": null })).toBe("function");
  });

  it("matches an address ending, case-sensitively, with no trailing slash", () => {
    expect(classifyPlane({}, ["https://h.example/base/t/Relation"])).toBe("relation");
    expect(classifyPlane({ "@id": "https://h.example/base/t/Function" })).toBe("function");
    expect(classifyPlane({}, ["https://h.example/base/t/Relation/"])).toBe("entity");
    expect(classifyPlane({ "@id": "https://h.example/base/t/function" })).toBe("entity");
  });

  it("does not fold the kind word", () => {
    expect(classifyPlane({ "a:nodeKind": "Function" })).toBe("entity");
    expect(classifyPlane({ "a:nodeKind": "relation" })).toBe("relation");
  });
});

describe("create and issued", () => {
  it("offers entity, function, and value, and not the other two", () => {
    expect(isCreatePlane("entity")).toBe(true);
    expect(isCreatePlane("function")).toBe(true);
    expect(isCreatePlane("value")).toBe(true);
    expect(isCreatePlane("relation")).toBe(false);
    expect(isCreatePlane("attribute")).toBe(false);
  });

  it("issues an uncatalogued name and a create plane, and not a missing or attribute plane", () => {
    expect(isIssuedOnTypeFind(undefined)).toBe(false);
    expect(isIssuedOnTypeFind("uncatalogued")).toBe(true);
    expect(isIssuedOnTypeFind("value")).toBe(true);
    expect(isIssuedOnTypeFind("attribute")).toBe(false);
    expect(isIssuedOnTypeFind("relation")).toBe(false);
  });
});
