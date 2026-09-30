import { describe, expect, it } from "vitest";
import {
  applyProcessKindParams,
  legacyStoredTypeOf,
  parseProcessKind,
  processKindOfTypeUri,
  standardKindLabel,
  standardKindRow,
} from "./kindHome";

describe("kind home", () => {
  it("opens Process for a bad or absent pk, and ProcessCard only for the retired stanza word", () => {
    expect(parseProcessKind(null)).toBe("process");
    expect(parseProcessKind("")).toBe("process");
    expect(parseProcessKind("schema")).toBe("process");
    expect(parseProcessKind("constructor")).toBe("process");
    expect(parseProcessKind("Stanza")).toBe("process");
    expect(parseProcessKind("stanza")).toBe("processCard");
    expect(parseProcessKind("processCard")).toBe("processCard");
  });

  it("drops pk for the default kind and always drops std", () => {
    const prev = new URLSearchParams("pk=processCard&std=x&other=1");
    expect(applyProcessKindParams(prev, "process").toString()).toBe("other=1");
    expect(prev.get("std")).toBe("x");
    expect(applyProcessKindParams(prev, "processCard").toString()).toBe("pk=processCard&other=1");
  });

  it("sends Stanza to ProcessCard and does not send Schema there", () => {
    expect(processKindOfTypeUri("t:Stanza")).toBe("processCard");
    expect(processKindOfTypeUri("https://example.test/base/t/Stanza")).toBe("processCard");
    expect(processKindOfTypeUri("t:Process")).toBe("process");
    expect(processKindOfTypeUri("Schema")).toBe("process");
    expect(processKindOfTypeUri(null)).toBe("process");
    expect(processKindOfTypeUri("https://example.test/vault/t/Stanza")).toBe("process");
    expect(() => processKindOfTypeUri("https://example.test/base/t/%")).toThrow(URIError);
  });

  it("discloses a stored name that is not the tab label", () => {
    expect(standardKindLabel("formSchema")).toBe("Form-Schema");
    expect(standardKindRow("processCard")?.wireTypes).toEqual(["ProcessCard", "Stanza"]);
    expect(legacyStoredTypeOf("processCard", "Stanza")).toBe("Stanza");
    expect(legacyStoredTypeOf("processCard", "ProcessCard")).toBeNull();
    expect(legacyStoredTypeOf("formSchema", "Schema")).toBe("Schema");
    expect(legacyStoredTypeOf("formSchema", "Form-Schema")).toBeNull();
    expect(legacyStoredTypeOf("referenceDocument", "ReferenceDocument")).toBe("ReferenceDocument");
    expect(legacyStoredTypeOf("lookupTable", "LookupTable")).toBe("LookupTable");
    expect(legacyStoredTypeOf("process", "")).toBeNull();
  });
});
