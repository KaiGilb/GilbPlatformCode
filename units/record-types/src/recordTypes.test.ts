import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import * as api from "./index";
import {
  ALLOWED_EXTRA_ATTR_SLUGS,
  RECORD_TYPES,
  RECORD_TYPE_BY_ID,
  attrKey,
  baseHost,
  isAppAddressableSlug,
  normalizeTypeUri,
  recordTypeByUri,
  resolveType,
  typeNamespace,
  typeUri,
  typeUriForVaultNamespace,
} from "./recordTypes";

beforeEach(() => setBaseOrigin("https://platform.example.test"));
afterEach(() => resetBaseOrigin());

describe("the origin is read when called, not at load", () => {
  it("baseHost, typeNamespace and typeUri follow the origin that is set (always https in the address)", () => {
    expect(baseHost()).toBe("platform.example.test");
    expect(typeNamespace()).toBe("https://platform.example.test/base/t/");
    expect(typeUri("Task")).toBe("https://platform.example.test/base/t/Task");
    setBaseOrigin("http://dev.example.test:8787");
    expect(baseHost()).toBe("dev.example.test:8787");
    expect(typeNamespace()).toBe("https://dev.example.test:8787/base/t/");
    expect(typeUri("Task")).toBe("https://dev.example.test:8787/base/t/Task");
  });

  it("with no origin set they throw an Error that names setBaseOrigin", () => {
    resetBaseOrigin();
    expect(() => baseHost()).toThrow(/setBaseOrigin/);
    expect(() => typeNamespace()).toThrow(/setBaseOrigin/);
    expect(() => typeUri("Task")).toThrow(/setBaseOrigin/);
    expect(() => recordTypeByUri()).toThrow(/setBaseOrigin/);
    expect(() => resolveType("note")).not.toThrow();
    expect(resolveType("")).toBeNull();
    expect(resolveType(undefined)).toBeNull();
    expect(() => resolveType("Task")).toThrow(/setBaseOrigin/);
    expect(() => normalizeTypeUri("t:Task")).toThrow(/setBaseOrigin/);
  });

  it("recordTypeByUri is keyed on the type addresses of the origin that is set, and is rebuilt when the origin changes", () => {
    const first = recordTypeByUri();
    expect(Object.keys(first)).toContain("https://platform.example.test/base/t/Task");
    expect(recordTypeByUri()).toBe(first);
    setBaseOrigin("https://other.example.test");
    const second = recordTypeByUri();
    expect(second).not.toBe(first);
    expect(Object.keys(second)).toContain("https://other.example.test/base/t/Task");
    expect(Object.keys(second)).not.toContain("https://platform.example.test/base/t/Task");
    expect(resolveType("https://other.example.test/base/t/Task")).toBe(RECORD_TYPE_BY_ID.task);
  });

  it("recordTypeByUri holds each type under its type name and every alias", () => {
    const map = recordTypeByUri();
    expect(map["https://platform.example.test/base/t/NoteDocument"]).toBe(RECORD_TYPE_BY_ID.note);
    expect(map["https://platform.example.test/base/t/Note"]).toBe(RECORD_TYPE_BY_ID.note);
    expect(map["https://platform.example.test/base/t/Contact"]).toBe(RECORD_TYPE_BY_ID.person);
    expect(Object.keys(map)).toHaveLength(RECORD_TYPES.length + 2);
  });
});

describe("RECORD_TYPES and RECORD_TYPE_BY_ID", () => {
  it("lists the ten types in order, with their names, labels and aliases", () => {
    expect(RECORD_TYPES.map((t) => [t.id, t.typeName, t.label, t.aliasTypeNames ?? null])).toEqual([
      ["note", "NoteDocument", "Note", ["Note"]],
      ["person", "Person", "Person", ["Contact"]],
      ["task", "Task", "Task", null],
      ["folder", "VirtualFolder", "Folder", null],
      ["function", "Function", "Function", null],
      ["functionConstraint", "FunctionConstraint", "Function Constraint", null],
      ["value", "Value", "Value", null],
      ["solution", "Solution", "Solution", null],
      ["designConstraint", "DesignConstraint", "Solution Constraint", null],
      ["resource", "Resource", "Development Resource", null],
    ]);
  });

  it("the person type takes its fields from the stakeholder package and holds none of its own", () => {
    const person = RECORD_TYPES.find((t) => t.id === "person")!;
    expect(person.fieldsFrom).toBe("stakeholder-package");
    expect(person.fields).toEqual([]);
  });

  it("RECORD_TYPE_BY_ID holds every id, and the retired id contact resolves to person", () => {
    for (const t of RECORD_TYPES) expect(RECORD_TYPE_BY_ID[t.id]).toBe(t);
    expect(RECORD_TYPE_BY_ID.contact).toBe(RECORD_TYPE_BY_ID.person);
    expect(Object.keys(RECORD_TYPE_BY_ID)).toHaveLength(RECORD_TYPES.length + 1);
  });
});

describe("resolveType", () => {
  it("resolves a local id, a retired id, an absolute address and every spelling normalizeTypeUri maps", () => {
    const task = RECORD_TYPE_BY_ID.task;
    expect(resolveType("task")).toBe(task);
    expect(resolveType("contact")).toBe(RECORD_TYPE_BY_ID.person);
    expect(resolveType("https://platform.example.test/base/t/Task")).toBe(task);
    expect(resolveType("t:Task")).toBe(task);
    expect(resolveType("Task")).toBe(task);
    expect(resolveType("https://anyone.example.test/base/t/Task")).toBe(task);
    expect(resolveType("https://platform.example.test/base/t/Contact")).toBe(RECORD_TYPE_BY_ID.person);
  });

  it("answers null for nothing, for an unknown name and for a foreign ontology address", () => {
    expect(resolveType(undefined)).toBeNull();
    expect(resolveType("")).toBeNull();
    expect(resolveType("nope")).toBeNull();
    expect(resolveType("https://other.example.test/ns/Task")).toBeNull();
  });
});

describe("typeUriForVaultNamespace", () => {
  it("is the host-free t: form, whatever the vault namespace", () => {
    expect(typeUriForVaultNamespace("Task", "https://u.platform.example.test/vault")).toBe("t:Task");
    expect(typeUriForVaultNamespace("t:Task", "")).toBe("t:Task");
    expect(typeUriForVaultNamespace("  Task ", "x")).toBe("t:Task");
  });

  it("with a blank name it falls back to the absolute address of the text as given", () => {
    expect(typeUriForVaultNamespace("", "x")).toBe("https://platform.example.test/base/t/");
    expect(typeUriForVaultNamespace("t:", "x")).toBe("https://platform.example.test/base/t/t:");
  });
});

describe("normalizeTypeUri", () => {
  it("maps every Base-family spelling of a type onto the one absolute address", () => {
    const want = "https://platform.example.test/base/t/Task";
    for (const raw of ["t:Task", "Task", "https://platform.example.test/base/t/Task", "https://u.example.test/base/t/Task", "http://u.example.test/base/t/Task", "https://u.example.test/BASE/T/Task", "https://u.example.test/base/t/Task?x#y"]) {
      expect(normalizeTypeUri(raw), raw).toBe(want);
    }
  });

  it("decodes a percent-encoded name", () => {
    expect(normalizeTypeUri("https://u.example.test/base/t/Some%20Name")).toBe("https://platform.example.test/base/t/Some Name");
  });

  it("keeps a foreign ontology address as it is, and answers the empty string for nothing", () => {
    expect(normalizeTypeUri("https://schema.example.test/Task")).toBe("https://schema.example.test/Task");
    expect(normalizeTypeUri("")).toBe("");
    expect(normalizeTypeUri(undefined)).toBe("");
    expect(normalizeTypeUri(null)).toBe("");
  });

  // Production quirk, kept: the match is on the path /base/t/<Name> under ANY host, so a third-party
  // Base-shaped address is collapsed onto the registry key too.
  it("collapses a third-party host with a /base/t/ path as well", () => {
    expect(normalizeTypeUri("https://someone-else.example.test/base/t/Task")).toBe("https://platform.example.test/base/t/Task");
  });
});

describe("attrKey and isAppAddressableSlug", () => {
  it("attrKey prefixes a:", () => {
    expect(attrKey("name")).toBe("a:name");
    expect(attrKey("")).toBe("a:");
  });

  it("isAppAddressableSlug accepts a letter followed by up to 63 letters, digits, - or _", () => {
    for (const ok of ["name", "a", "Name_1", "a-b", "x".repeat(64)]) expect(isAppAddressableSlug(ok), ok).toBe(true);
    for (const bad of ["", "1a", "-a", "_a", "a b", "a:b", "owl:sameAs", "http://x.example.test/y", "x".repeat(65)]) {
      expect(isAppAddressableSlug(bad), bad).toBe(false);
    }
  });
});

describe("the export list", () => {
  it("is exactly these names (the three types are erased)", () => {
    expect(Object.keys(api).sort()).toEqual([
      "ALLOWED_EXTRA_ATTR_SLUGS",
      "RECORD_TYPES",
      "RECORD_TYPE_BY_ID",
      "attrKey",
      "baseHost",
      "isAppAddressableSlug",
      "normalizeTypeUri",
      "recordTypeByUri",
      "resolveType",
      "typeNamespace",
      "typeUri",
      "typeUriForVaultNamespace",
    ]);
  });
});

describe("ALLOWED_EXTRA_ATTR_SLUGS", () => {
  it("is the nine seed slugs, in this order", () => {
    expect([...ALLOWED_EXTRA_ATTR_SLUGS]).toEqual(["url", "phone", "email", "due", "personalNote", "jobTitle", "postalAddress", "account", "org"]);
  });

  it("holds only slugs the app can address, with none twice", () => {
    expect(ALLOWED_EXTRA_ATTR_SLUGS.every((s) => isAppAddressableSlug(s))).toBe(true);
    expect(new Set(ALLOWED_EXTRA_ATTR_SLUGS).size).toBe(ALLOWED_EXTRA_ATTR_SLUGS.length);
  });

  it("is also reachable from the package index", () => {
    expect(api.ALLOWED_EXTRA_ATTR_SLUGS).toBe(ALLOWED_EXTRA_ATTR_SLUGS);
  });
});
