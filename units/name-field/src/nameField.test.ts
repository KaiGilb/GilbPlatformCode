import { describe, expect, it } from "vitest";
import { NAME_FIELDS, isNameFieldKey, nameFieldKeyFromProfileType } from "./nameField";

describe("name field", () => {
  it("names exactly two fields, in this order", () => {
    expect([...NAME_FIELDS]).toEqual(["given-name", "family-name"]);
  });

  it("accepts only those two spellings", () => {
    expect(isNameFieldKey("given-name")).toBe(true);
    expect(isNameFieldKey("family-name")).toBe(true);
    expect(isNameFieldKey("Given-name")).toBe(false);
    expect(isNameFieldKey("given-name ")).toBe(false);
    expect(isNameFieldKey("given")).toBe(false);
    expect(isNameFieldKey("org")).toBe(false);
    expect(isNameFieldKey("title")).toBe(false);
    expect(isNameFieldKey("email")).toBe(false);
    expect(isNameFieldKey("skill")).toBe(false);
    expect(isNameFieldKey("address")).toBe(false);
    expect(isNameFieldKey(null)).toBe(false);
  });

  it("maps a profile type only when it is already one of the two", () => {
    expect(nameFieldKeyFromProfileType("given-name")).toBe("given-name");
    expect(nameFieldKeyFromProfileType("family-name")).toBe("family-name");
    expect(nameFieldKeyFromProfileType("skill")).toBeNull();
    expect(nameFieldKeyFromProfileType("org")).toBeNull();
    expect(nameFieldKeyFromProfileType("title")).toBeNull();
    expect(nameFieldKeyFromProfileType("address")).toBeNull();
    expect(nameFieldKeyFromProfileType("")).toBeNull();
  });
});
