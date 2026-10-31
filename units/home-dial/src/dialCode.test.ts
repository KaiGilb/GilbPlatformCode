// The source's two phone tests (`dialCode.test.ts` 3 cases, `countryCallingCode.test.ts` 2 cases), then the new ones that
// measure the app's `joinPhone` against `phone-text`'s on inputs, and the one function of `phone-text` that is not token-equal.
import { describe, expect, it } from "vitest";
import { callingCodesOf, claimForPhonePrefill, claimLabeledHome, joinPhone as textJoinPhone, splitPhone } from "@kaigilb/gilbplatformcode-phone-text";
import { joinPhone } from "./dialCode";

describe("phone parts (the source's cases; split/claims are phone-text's, joinPhone is this unit's)", () => {
  it("splits on the space the writer put there, and does not guess a code", () => {
    expect(splitPhone("+47 900 00 000")).toEqual({ dial: "47", national: "900 00 000" });
    expect(joinPhone("46", "701234567")).toBe("+46 701234567");
    expect(splitPhone("+4790000000")).toEqual({ dial: "", national: "+4790000000" });
    expect(splitPhone("900 00 000").dial).toBe("");
  });
  it("a number that already starts with + is kept as typed", () => {
    expect(joinPhone("47", "+4790012345")).toBe("+4790012345");
    expect(joinPhone("", "+1-555-0100")).toBe("+1-555-0100");
    expect(joinPhone("47", "900")).toBe("+47 900");
  });
  it("several addresses use home, and one address is enough", () => {
    const work = { label: "Work", id: "w" };
    const home = { label: "Home", id: "h" };
    expect(claimForPhonePrefill([work, home])?.id).toBe("h");
    expect(claimLabeledHome([work, home])?.id).toBe("h");
    expect(claimForPhonePrefill([work, { label: "Cabin", id: "c" }])).toBeNull();
    expect(claimForPhonePrefill([work])?.id).toBe("w");
  });
});

describe("country calling codes (the source's cases, phone-text's reader)", () => {
  it("reads one code served as a string and two codes served as an array", () => {
    expect(callingCodesOf("+47")).toEqual(["+47"]);
    expect(callingCodesOf(["+47"])).toEqual(["+47"]);
    expect(callingCodesOf(["+290", "+247"])).toEqual(["+290", "+247"]);
  });
  it("keeps the country code alone", () => {
    expect(callingCodesOf("+1")).toEqual(["+1"]);
    expect(callingCodesOf("+1 876")).toEqual([]);
    expect(callingCodesOf("47")).toEqual([]);
  });
});

describe("joinPhone (the app's) on inputs", () => {
  it.each([
    ["47", "900 00 000", "+47 900 00 000"],
    ["+47", "900", "+47 900"],
    ["(47)", "900", "+47 900"],
    ["4 7", "900", "+47 900"],
    ["47", "  900  ", "+47 900"],
    ["47", "", "+47"],
    ["47", "   ", "+47"],
    ["", "900", "900"],
    ["abc", "900", "900"],
    ["", "", ""],
    ["", "  ", ""],
    ["abc", "", ""],
    ["47", "+4790012345", "+4790012345"],
    ["", "+1-555-0100", "+1-555-0100"],
    ["47", "  +4790012345  ", "+4790012345"],
    ["47", "+", "+"],
  ])("joinPhone(%j, %j) is %j", (dial, national, want) => {
    expect(joinPhone(dial, national)).toBe(want);
  });
});

describe("the FALSE FRIEND: phone-text's joinPhone is not the app's", () => {
  it("the two agree whenever the national number does not start with +", () => {
    const dials = ["", "47", "+47", "4 7", "abc", "1"];
    const nationals = ["", " ", "900", "  900 00 ", "0900", "(555) 0100", "a+b"];
    for (const d of dials) for (const n of nationals) expect(textJoinPhone(d, n), `${JSON.stringify([d, n])}`).toBe(joinPhone(d, n));
  });
  it("they differ exactly when the national number starts with +, and a code is given: phone-text puts the code in front of the plus", () => {
    expect(joinPhone("47", "+4790012345")).toBe("+4790012345");
    expect(textJoinPhone("47", "+4790012345")).toBe("+47 +4790012345");
    expect(joinPhone("1", "+1-555")).toBe("+1-555");
    expect(textJoinPhone("1", "+1-555")).toBe("+1 +1-555");
  });
  it("with no code the two agree even for a number that starts with + (the trimmed number)", () => {
    expect(joinPhone("", "+1-555-0100")).toBe(textJoinPhone("", "+1-555-0100"));
    expect(joinPhone("", "  +1-555  ")).toBe("+1-555");
  });
});

// The app's own `claimForPhonePrefill`, written out as the oracle (the unit imports phone-text's, which is not token-equal:
// it reads `const only = claims[0]; return only ?? null;` where the app has `return claims[0]!;`).
function appClaimForPhonePrefill<T extends { label: string }>(claims: readonly T[]): T | null {
  const home = claims.find((c) => c.label.trim().toLowerCase() === "home") ?? null;
  if (home) return home;
  if (claims.length === 1) return claims[0]!;
  return null;
}

describe("claimForPhonePrefill: phone-text's against the app's on inputs", () => {
  const c = (label: string, id = label) => ({ label, id });
  const cases: Array<[string, Array<{ label: string; id: string }>]> = [
    ["none", []],
    ["one other", [c("Work")]],
    ["one home", [c("Home")]],
    ["home among others", [c("Work"), c("Home"), c("Cabin")]],
    ["home is trimmed and case-folded", [c("Work"), c("  HOME ", "h")]],
    ["two homes: the first", [c("home", "a"), c("Home", "b")]],
    ["several, none home", [c("Work"), c("Cabin")]],
    ["one with an empty label", [c("")]],
  ];
  it.each(cases)("%s", (_name, claims) => {
    expect(claimForPhonePrefill(claims)).toBe(appClaimForPhonePrefill(claims));
  });
  it("a hole in the list throws in both before the two differ", () => {
    const withHole = [undefined] as unknown as Array<{ label: string }>;
    expect(() => appClaimForPhonePrefill(withHole)).toThrow(TypeError);
    expect(() => claimForPhonePrefill(withHole)).toThrow(TypeError);
  });
});
