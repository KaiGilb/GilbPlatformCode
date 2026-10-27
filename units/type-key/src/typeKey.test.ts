import { afterEach, describe, expect, test } from "vitest";
import { defaultTypeKey, isTypeName, resetTypeKey, setTypeKey, typeKey } from "./typeKey";
import * as api from "./index";

afterEach(() => resetTypeKey());

describe("defaultTypeKey", () => {
  test.each([
    ["https://example.test/base/t/FunctionConstraint", "functionconstraint"],
    ["t:Scale", "scale"],
    ["Scale", "scale"],
    ["", ""],
    ["https://example.test/other/Thing", "https://example.test/other/thing"],
    ["https://example.test/base/t/A%20B", "a b"],
    ["a/b", "b"],
    ["t:", "t:"],
  ])("%j -> %j", (input, key) => {
    expect(defaultTypeKey(input)).toBe(key);
  });

  test("any host, http or https, gives the same key", () => {
    expect(defaultTypeKey("http://one.example.test/base/t/Value")).toBe("value");
    expect(defaultTypeKey("https://two.example.test/base/t/Value")).toBe("value");
  });

  test("the /base/t/ match is case-insensitive and stops at / # ?", () => {
    expect(defaultTypeKey("https://example.test/BASE/T/Value")).toBe("value");
    expect(defaultTypeKey("https://example.test/base/t/Value#frag")).toBe("value");
    expect(defaultTypeKey("https://example.test/base/t/Value?x=1")).toBe("value");
    expect(defaultTypeKey("https://example.test/base/t/Value/extra")).toBe("value");
  });

  test("a foreign URL with an empty type segment is kept whole, lower-cased", () => {
    expect(defaultTypeKey("https://example.test/base/t/")).toBe("https://example.test/base/t/");
  });

  test("a bare name with t: and a slash keeps only the part after the last slash", () => {
    expect(defaultTypeKey("t:a/b")).toBe("b");
    expect(defaultTypeKey("x/")).toBe("x/");
  });

  test("a percent-encoded slash in the type segment is decoded, then cut at the last slash", () => {
    expect(defaultTypeKey("https://example.test/base/t/A%2FB")).toBe("b");
  });

  test("a malformed percent escape throws, as the source's decodeURIComponent does", () => {
    expect(() => defaultTypeKey("https://example.test/base/t/%E0%A4%A")).toThrow(URIError);
  });

  test("case is folded", () => {
    expect(defaultTypeKey("PlanguageLevel")).toBe("planguagelevel");
    expect(defaultTypeKey("t:ScaleQualifierDefinition")).toBe("scalequalifierdefinition");
  });
});

describe("isTypeName", () => {
  test("true across URL, CURIE and bare forms", () => {
    expect(isTypeName("https://example.test/base/t/Scale", "Scale")).toBe(true);
    expect(isTypeName("t:Scale", "Scale")).toBe(true);
    expect(isTypeName("Scale", "Scale")).toBe(true);
    expect(isTypeName("scale", "Scale")).toBe(true);
    expect(isTypeName("https://one.example.test/base/t/Scale", "https://two.example.test/base/t/scale")).toBe(true);
    expect(isTypeName("t:Scale", "https://example.test/base/t/Scale")).toBe(true);
  });
  test("false for a different name", () => {
    expect(isTypeName("https://example.test/base/t/Scale", "ScaleQualifier")).toBe(false);
    expect(isTypeName("t:Meter", "MeterLine")).toBe(false);
    expect(isTypeName("", "Scale")).toBe(false);
  });
  test("a foreign URL is not the type of the same last word", () => {
    expect(isTypeName("https://example.test/other/Scale", "Scale")).toBe(false);
  });
  test("two empty strings are the same type", () => {
    expect(isTypeName("", "")).toBe(true);
  });
  test("the default does not join a registry's aliases", () => {
    expect(isTypeName("https://example.test/base/t/NoteDocument", "Note")).toBe(false);
  });
});

describe("setTypeKey / typeKey / resetTypeKey", () => {
  test("typeKey is the default until a function is set", () => {
    expect(typeKey("t:Scale")).toBe("scale");
  });
  test("setTypeKey replaces the function used by typeKey and isTypeName", () => {
    const registry: Record<string, string> = {
      "https://example.test/base/t/NoteDocument": "note",
      Note: "note",
    };
    setTypeKey((x) => registry[x] ?? defaultTypeKey(x));
    expect(typeKey("https://example.test/base/t/NoteDocument")).toBe("note");
    expect(isTypeName("https://example.test/base/t/NoteDocument", "Note")).toBe(true);
    expect(isTypeName("https://example.test/base/t/Scale", "Scale")).toBe(true);
  });
  test("resetTypeKey puts the default back", () => {
    setTypeKey(() => "same");
    expect(isTypeName("a", "b")).toBe(true);
    resetTypeKey();
    expect(isTypeName("a", "b")).toBe(false);
    expect(typeKey("t:Scale")).toBe("scale");
  });
  test("setTypeKey called again replaces the previous one", () => {
    setTypeKey(() => "one");
    setTypeKey((x) => x.toUpperCase());
    expect(typeKey("ab")).toBe("AB");
  });
});

test("index exports exactly the five names", () => {
  expect(Object.keys(api).sort()).toEqual(["defaultTypeKey", "isTypeName", "resetTypeKey", "setTypeKey", "typeKey"]);
});
