// The data rules of the stakeholder header (image shape rule). A person is a circle, everything else a rounded square, from the KIND in the data (the kind and its is-a ancestors), ⛔ never a name.
import { describe, expect, test } from "vitest";
import { contactImageType, holderCaption, isOwnVault } from "./StakeholderContactHeader";
import { imageShapeOf } from "@kaigilb/gilbplatformcode-stakeholder-ui-kit";

const T = (local: string) => `https://ontology.example.test/base/t/${local}`;
const shape = (kind: { kind: string; ancestors: string[] } | null) => imageShapeOf(contactImageType(kind));

describe("contactImageType", () => {
  test("a kind under Person is a person: circle", () => {
    expect(shape({ kind: T("Person"), ancestors: [T("Agent")] })).toBe("circle");
    expect(shape({ kind: T("Customer"), ancestors: [T("Person"), T("Agent")] })).toBe("circle");
  });
  test("an organization, a project, any other kind: rounded square", () => {
    expect(shape({ kind: T("Organization"), ancestors: [T("Agent")] })).toBe("rounded-square");
    expect(shape({ kind: T("Project"), ancestors: [] })).toBe("rounded-square");
  });
  test("unknown kind: rounded square; a kind NAMED like a person but not under Person is not one", () => {
    expect(shape(null)).toBe("rounded-square");
    expect(shape({ kind: T("PersonnelOffice"), ancestors: [T("Organization")] })).toBe("rounded-square");
  });
});

describe("holderCaption and isOwnVault", () => {
  const v = (over: Partial<{ vaultId: string; represents: string | null; isLandingVault: boolean }>) => ({ vaultId: "https://a.example.test/vault", represents: null, isLandingVault: false, ...over });
  test("the holder's own vault is Me (by the landing flag or by the own vault id)", () => {
    expect(holderCaption(v({ isLandingVault: true }), null)).toBe("Me");
    expect(holderCaption(v({}), "https://a.example.test/vault/")).toBe("Me");
    expect(isOwnVault(v({}), "https://b.example.test/vault")).toBe(false);
  });
  test("another vault is named by its type's local name; no type reported: 'Vault'", () => {
    expect(holderCaption(v({ represents: T("Organization") }), null)).toBe("Organization vault");
    expect(holderCaption(v({ represents: T("Project") }), null)).toBe("Project vault");
    expect(holderCaption(v({}), null)).toBe("Vault");
  });
});
