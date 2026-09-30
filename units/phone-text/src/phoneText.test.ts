import { expect, test } from "vitest";
import { callingCodesOf, claimForPhonePrefill, joinPhone, splitPhone } from "./phoneText";

test("a spaced number splits and a tight number does not guess", () => {
  expect(splitPhone("+47 12345678")).toEqual({ dial: "47", national: "12345678" });
  expect(splitPhone("+4712345678")).toEqual({ dial: "", national: "+4712345678" });
  expect(splitPhone("tel:+1 202")).toEqual({ dial: "1", national: "202" });
});

test("join puts the code and the rest back with one space", () => {
  expect(joinPhone("47", "123")).toBe("+47 123");
  expect(joinPhone("", "")).toBe("");
  expect(joinPhone("", "123")).toBe("123");
});

test("home wins, one address is used, several with no home is not a guess", () => {
  const home = { label: "Home" };
  const work = { label: "Work" };
  expect(claimForPhonePrefill([work, home])).toBe(home);
  expect(claimForPhonePrefill([work])).toBe(work);
  expect(claimForPhonePrefill([work, { label: "Other" }])).toBeNull();
});

test("one calling code may be a string and a bad code is dropped", () => {
  expect(callingCodesOf("+47")).toEqual(["+47"]);
  expect(callingCodesOf(["+290", "+247", "nope", "+290"])).toEqual(["+290", "+247"]);
  expect(callingCodesOf(null)).toEqual([]);
});
