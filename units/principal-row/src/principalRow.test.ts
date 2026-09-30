import { describe, expect, it } from "vitest";
import { keyNamespace, principalGrantKey, principalLabel, principalRow } from "./principalRow";

describe("keyNamespace", () => {
  it("classifies the path and does not trim", () => {
    expect(keyNamespace("https://h.example/base/g/1")).toBe("group");
    expect(keyNamespace("https://h.example/base/p/1")).toBe("principal");
    expect(keyNamespace("https://h.example/base")).toBe("pod");
    expect(keyNamespace("https://h.example/base/")).toBe("pod");
    expect(keyNamespace("https://h.example/i")).toBe("pod");
    expect(keyNamespace("https://h.example/files/i")).toBe("pod");
    expect(keyNamespace("https://h.example/vault")).toBe("other");
    expect(keyNamespace("https://h.example/base/g")).toBe("other");
    expect(keyNamespace("https://h.example/i/")).toBe("other");
    expect(keyNamespace("https://h.example/BASE/p/1")).toBe("other");
    expect(keyNamespace("not a url")).toBe("other");
    expect(keyNamespace(" https://h.example/base")).toBe("pod");
    expect(keyNamespace("https://h.example/base ")).toBe("pod");
    expect(keyNamespace("https://h example/base")).toBe("other");
  });
});

describe("principalRow", () => {
  const group = "https://h.example/base/g/1";
  const person = "https://h.example/base/p/1";
  const pod = "https://kaizen.example/base";

  it("uses a supplied name and does not replace the key with the page", () => {
    const row = principalRow(person, {
      label: "  Ada  ",
      labelSource: "account-email",
      webId: "  https://ada.example/i  ",
      viewer: "self",
    });
    expect(row.title).toBe("Ada");
    expect(row.badge).toBe("YOU");
    expect(row.provenance).toBe("The email this key signs in as");
    expect(row.grantKey).toBe(person);
    expect(row.identityPage).toBe("https://ada.example/i");
    expect(principalGrantKey("  " + person)).toBe("  " + person);
    expect(principalLabel(person, { label: "Ada", labelSource: "vault-name" })).toBe("Ada");
  });

  it("does not treat a blank label as a name, and does not invent a register", () => {
    const unnamed = principalRow(person, { label: "   ", webId: "  " });
    expect(unnamed.title).toBe("Principal key");
    expect(unnamed.provenance).toBe("No name was returned for this principal. It holds the access below.");
    expect(unnamed.identityPage).toBeNull();
    expect(unnamed.badge).toBeNull();
    const stated = principalRow(person, { label: "Ada" });
    expect(stated.provenance).toBe("Name supplied by BaseID (register not stated)");
  });

  it("keeps omitted registered apart from false, and words other as a principal", () => {
    expect(principalRow(group, { registered: true }).title).toBe("Registered group");
    expect(principalRow(group).title).toBe("Group key");
    expect(principalRow(group).provenance).toContain("No name was returned");
    expect(principalRow(group, { registered: false }).provenance).toContain("holds no reserved name");
    expect(principalRow("https://h.example/vault", { registered: true }).title).toBe("Registered principal");
    expect(principalRow(person, { viewer: "earlier-identity-of-self" }).badge).toBe(
      "YOU — EARLIER IDENTITY",
    );
  });

  it("names a pod from the host, with id and www kept whole", () => {
    expect(principalRow(pod).title).toBe("kaizen");
    expect(principalRow(pod).provenance).toContain("Read from the vault's own host");
    expect(principalRow(pod, { registered: true }).title).toBe("kaizen");
    expect(principalRow(pod, { registered: true }).provenance).toBe(
      "A vault identity registered in BaseID; no reserved name",
    );
    expect(principalRow("https://id.example/base").title).toBe("id.example");
    expect(principalRow("https://www.example/base").title).toBe("www.example");
    expect(principalRow("https://192.0.2.1/base").title).toBe("192");
    expect(principalRow("https://h.example/i").title).not.toBe("Vault");
  });

  it("uses the earlier-account sentence with an em dash", () => {
    expect(principalRow(person, { label: "Old", labelSource: "account-email-superseded" }).provenance).toBe(
      "An earlier sign-in identity of this account — the account no longer signs in as this key, " +
        "but this key still holds the access below",
    );
  });
});
