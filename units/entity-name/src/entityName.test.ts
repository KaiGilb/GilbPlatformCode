import { describe, expect, it } from "vitest";
import {
  entityDisplayName,
  openTypeNameSlug,
  withCanonicalLabel,
} from "./entityName";

describe("entityDisplayName", () => {
  it("prefers label, then unitTag, then tag, and does not shorten a label", () => {
    expect(entityDisplayName({ label: "analyse big data", title: "" }, { nameField: "title" })).toBe(
      "analyse big data",
    );
    expect(entityDisplayName({ label: "https://connect.example/base", unitTag: "T" })).toBe(
      "https://connect.example/base",
    );
    expect(entityDisplayName({ unitTag: "Proc", title: "" }, { nameField: "title" })).toBe("Proc");
    expect(entityDisplayName({ tag: "my-handle" })).toBe("my-handle");
  });

  it("shortens identity values and the entity uri, and a tag beats a bridge", () => {
    expect(
      entityDisplayName({
        accountSubject: "7d510806-3349-4781-a8e1-bba0b69540ec",
        anchorBoundEmail: "user@example.test",
      }),
    ).toBe("user@example.test");
    expect(entityDisplayName({ registeredVault: "https://connect.example/base" })).toBe("connect.example");
    expect(
      entityDisplayName(
        { isPrincipal: "true" },
        { entityUri: "https://id.example/base/p/8b0d8f48-e5c2-43a9" },
      ),
    ).toBe("8b0d8f48-e5c2-43a9");
    expect(
      entityDisplayName({ unitTag: "T", processName: "P" }, { nameField: "processName" }),
    ).toBe("T");
    expect(entityDisplayName({ ruleId: "RULE-7" })).toBe("Untitled");
    expect(entityDisplayName({})).toBe("Untitled");
    expect(entityDisplayName(null)).toBe("Untitled");
    expect(entityDisplayName({}, { fallback: "" })).toBe("");
  });
});

describe("openTypeNameSlug", () => {
  it("keeps title when title exists, and label when the label is a real name", () => {
    expect(openTypeNameSlug({ label: "Cat" })).toBe("label");
    expect(openTypeNameSlug({ title: "Older node" })).toBe("title");
    expect(openTypeNameSlug({ label: "PROC_01", title: "Assign the reviewer" })).toBe("title");
    expect(openTypeNameSlug({ label: "Cat", title: "Cat" })).toBe("title");
    expect(openTypeNameSlug({ label: "Cat", tag: "type-cat" })).toBe("label");
    expect(openTypeNameSlug({})).toBe("label");
    expect(openTypeNameSlug(null)).toBe("label");
    expect(openTypeNameSlug({ title: "   " })).toBe("label");
  });

  it("binds a tag-copy label to title so the box stays empty", () => {
    expect(openTypeNameSlug({ label: "PROC_01", unitTag: "PROC_01" })).toBe("title");
    expect(openTypeNameSlug({ label: "RULE-7", tag: "RULE-7" })).toBe("title");
    expect(openTypeNameSlug({ label: "PROC_01", "unit-tag": "PROC_01" })).toBe("title");
    expect(openTypeNameSlug({ label: "RULE-7", ruleId: "RULE-7" })).toBe("title");
    expect(openTypeNameSlug({ label: "RULE-7", "rule-id": "RULE-7" })).toBe("title");
    expect(entityDisplayName({ label: "PROC_01", unitTag: "PROC_01" })).toBe("PROC_01");
  });
});

describe("withCanonicalLabel", () => {
  it("copies the name field, and does not let a tag overwrite a label", () => {
    expect(withCanonicalLabel({ title: "New note" }, "title")).toEqual({
      title: "New note",
      label: "New note",
    });
    expect(withCanonicalLabel({ unitTag: "ProcVdcStX", label: "Human name" }, "title")).toEqual({
      unitTag: "ProcVdcStX",
      label: "Human name",
      title: "Human name",
    });
    const aligned = { label: "A", title: "A" };
    expect(withCanonicalLabel(aligned, "title")).toBe(aligned);
  });

  it("lets a bridge beat a tag on the write, and copies a tag only when no bridge exists", () => {
    expect(withCanonicalLabel({ unitTag: "T", processName: "P" })).toEqual({
      unitTag: "T",
      processName: "P",
      label: "P",
      title: "P",
    });
    expect(withCanonicalLabel({ unitTag: "ProcVdcStX" }, "title")).toEqual({
      unitTag: "ProcVdcStX",
      label: "ProcVdcStX",
    });
    expect(withCanonicalLabel({ accountSubject: "1@example.test" }, "title")).toEqual({
      accountSubject: "1@example.test",
      label: "1@example.test",
    });
    expect(withCanonicalLabel({ registeredVault: "https://connect.example/base" }, "title")).toEqual({
      registeredVault: "https://connect.example/base",
      label: "connect.example",
    });
  });
});
