import { describe, expect, it } from "vitest";
import {
  bindKeysFromRaw,
  displayDoesForLang,
  displayLabelForLang,
  exactMatchFromRaw,
  examplesFromRaw,
  hasValueIrisFromRaw,
  kindSpecificTitle,
  languageDisplayName,
  multilangFromRaw,
  poleFromChain,
  sanskritFromRaw,
  valuePlanguageFromRaw,
  verbFromRaw,
} from "./termView";

describe("sanskritFromRaw", () => {
  it("needs a romanized or devanagari line, and trims", () => {
    expect(sanskritFromRaw({})).toBeNull();
    expect(sanskritFromRaw({ "a:sanskritLabel": { "a:gloss": "only" } })).toBeNull();
    expect(sanskritFromRaw({ sanskritLabel: { romanized: "  dharma  " } })).toEqual({
      romanized: "dharma",
      devanagari: "",
      gloss: "",
    });
  });
});

describe("multilangFromRaw", () => {
  it("returns null when only alt labels are present", () => {
    expect(multilangFromRaw({ "a:altLabelByLang": { en: "Other" } })).toBeNull();
    expect(multilangFromRaw({ "a:labelByLang": {} })).toBeNull();
  });

  it("puts en first, keeps other codes in order, and takes the first list entry", () => {
    const view = multilangFromRaw({
      labelByLang: { fr: ["  Bonjour ", "ignored"], de: "Hallo", en: "Hello" },
      doesByLang: { fr: "faire" },
      altLabelByLang: { fr: ["  un  ", "", " deux "] },
    });
    expect(view?.languages).toEqual(["en", "de", "fr"]);
    expect(view?.names.fr).toBe("Bonjour");
    expect(view?.names.en).toBe("Hello");
    expect(view?.descriptions.fr).toBe("faire");
    expect(view?.altLabels.fr).toEqual(["un", "deux"]);
  });
});

describe("valuePlanguageFromRaw", () => {
  it("returns null when the only filled field is one this reader does not treat as content", () => {
    expect(valuePlanguageFromRaw({})).toBeNull();
    expect(valuePlanguageFromRaw({ "a:rate": "per day" })).toBeNull();
    expect(valuePlanguageFromRaw({ "a:confidence": 1 })).toBeNull();
    expect(valuePlanguageFromRaw({ sameAs: "http://example.test/x" })).toBeNull();
    expect(valuePlanguageFromRaw({ "a:endpointReference": "bench" })).toBeNull();
  });

  it("keeps a string scale, and also treats an http-prefixed string as a ref", () => {
    const plain = valuePlanguageFromRaw({ scale: "minutes" });
    expect(plain?.scale).toBe("minutes");
    expect(plain?.scaleRef).toBeNull();
    expect(plain?.scaleInline).toBe(false);

    const httpWord = valuePlanguageFromRaw({ "a:scale": "httpfoo" });
    expect(httpWord?.scale).toBe("httpfoo");
    expect(httpWord?.scaleRef).toBe("httpfoo");
  });

  it("an object with @id is a ref, not an inline scale", () => {
    const view = valuePlanguageFromRaw({
      "a:scale": { "@id": "not-an-address" },
      "a:scaleAnchors": "0 to 10",
    });
    expect(view?.scaleRef).toBe("not-an-address");
    expect(view?.scaleInline).toBe(false);
    expect(view?.scale).toBe("0 to 10");
  });

  it("an object without @id is inline, and a blank inline unit does not wipe the outer unit", () => {
    const view = valuePlanguageFromRaw({
      unit: "outer",
      "a:scale": { "a:does": "  from open  ", "a:unit": "   ", "a:rate": "per task" },
    });
    expect(view?.scaleInline).toBe(true);
    expect(view?.scale).toBe("from open");
    expect(view?.unit).toBe("outer");
    expect(view?.rate).toBe("per task");
  });

  it("a valuedBy string stays text, even when it starts with http", () => {
    const view = valuePlanguageFromRaw({
      scale: "x",
      valuedBy: " http://example.test/person ",
    });
    expect(view?.valuedByText).toBe("http://example.test/person");
    expect(view?.valuedByIris).toEqual([]);
  });

  it("a valuedBy list keeps @id values that are not addresses, and drops plain words", () => {
    const view = valuePlanguageFromRaw({
      scale: "x",
      "a:valuedBy": ["word", { "@id": "bare" }, { "@id": "http://example.test/p" }],
    });
    expect(view?.valuedByIris).toEqual(["bare", "http://example.test/p"]);
  });

  it("an empty meter object still counts, and its label is the word Meter", () => {
    const view = valuePlanguageFromRaw({ hasMeter: [{}] });
    expect(view?.meters).toEqual([{ label: "Meter", method: "", meterId: "", agentKind: "" }]);
  });

  it("writes a numeric confidence, including 0, only when something else makes the view exist", () => {
    expect(valuePlanguageFromRaw({ scale: "x", confidence: 0 })?.confidence).toBe("0");
  });
});

describe("lists and keys", () => {
  it("trims examples and drops blanks", () => {
    expect(examplesFromRaw({ example: "  one  " })).toEqual(["one"]);
    expect(examplesFromRaw({ "a:example": [" a ", "", 1, "b"] })).toEqual(["a", "b"]);
    expect(examplesFromRaw({})).toEqual([]);
  });

  it("returns a verb trimmed, or empty", () => {
    expect(verbFromRaw({ verb: "  send " })).toBe("send");
    expect(verbFromRaw({})).toBe("");
  });

  it("bind keys take the first list entry only", () => {
    expect(
      bindKeysFromRaw({
        "a:predicateAttribute": ["  a:samplingProtocol ", "second"],
        typeAttribute: "t:Catch",
      }),
    ).toEqual({ predicateAttribute: "a:samplingProtocol", typeAttribute: "t:Catch" });
    expect(bindKeysFromRaw({})).toEqual({ predicateAttribute: "", typeAttribute: "" });
  });

  it("dedupes value iris and ignores a word that does not start with http", () => {
    expect(
      hasValueIrisFromRaw({
        "a:hasValue": ["http://example.test/v", { "@id": "http://example.test/v" }, "word"],
      }),
    ).toEqual(["http://example.test/v"]);
  });
});

describe("refs, pole, labels", () => {
  it("an empty @id on the last key is an empty string, and an earlier empty @id falls through", () => {
    expect(exactMatchFromRaw({ exactMatch: { "@id": "" } })).toBe("");
    expect(
      exactMatchFromRaw({
        "skos:exactMatch": { "@id": "" },
        exactMatch: "http://example.test/m",
      }),
    ).toBe("http://example.test/m");
  });

  it("the first matching pole wins, and 'the actual' beats 'imagined' on the same node", () => {
    expect(poleFromChain([{ name: "Other", label: "the actual imagined" }])).toBe("Maya");
    expect(poleFromChain([{ name: "Brahman", label: "imagined" }])).toBe("Brahman");
    expect(poleFromChain([{ name: "Child", label: "nothing" }])).toBeNull();
  });

  it("kind titles", () => {
    expect(kindSpecificTitle("function")).toBe("Function");
    expect(kindSpecificTitle("value")).toBe("Value");
    expect(kindSpecificTitle("type")).toBe("Type");
  });

  it("language names are this unit's code map, not the document helper", () => {
    expect(languageDisplayName("en")).toBe("English");
    expect(languageDisplayName("zh")).toBe("ZH");
    expect(languageDisplayName("en-US")).toBe("EN-US");
  });

  it("a missing language, or no language, falls back to the document label and does", () => {
    const doc = {
      label: "Fallback",
      does: "Does",
      raw: { labelByLang: { en: "Hello" }, doesByLang: { en: "act" } },
    };
    expect(displayLabelForLang(doc, null)).toBe("Fallback");
    expect(displayLabelForLang(doc, "en")).toBe("Hello");
    expect(displayLabelForLang(doc, "fr")).toBe("Fallback");
    expect(displayDoesForLang(doc, "en")).toBe("act");
    expect(displayDoesForLang(doc, null)).toBe("Does");
  });
});
