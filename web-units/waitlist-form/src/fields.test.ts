// Field rules are pure and shared with the host's server. Tests are new for this unit.
import { describe, expect, test } from "vitest";
import { buildBody, validate, type WaitlistExtra } from "./fields";
import { defaultWaitlistFields, type WaitlistField } from "./types";

const email = "ada@example.test";

describe("validate", () => {
  test("email is required, and a blank address is not reported as a bad shape", () => {
    expect(validate(defaultWaitlistFields, { email: "" })).toEqual([{ name: "email", code: "required" }]);
    expect(validate(defaultWaitlistFields, { email: "   " })).toEqual([{ name: "email", code: "required" }]);
  });

  test("a non-empty email must be something, an @, something, a dot, and something", () => {
    expect(validate(defaultWaitlistFields, { email: "not-an-email" })).toEqual([{ name: "email", code: "invalidEmail" }]);
    expect(validate(defaultWaitlistFields, { email: "a@b" })).toEqual([{ name: "email", code: "invalidEmail" }]);
    expect(validate(defaultWaitlistFields, { email: "a @b.co" })).toEqual([{ name: "email", code: "invalidEmail" }]);
    expect(validate(defaultWaitlistFields, { email })).toEqual([]);
    expect(validate(defaultWaitlistFields, { email: `${"a".repeat(249)}@b.co` })).toEqual([]);
  });

  test("maxLength is counted after trimming", () => {
    expect(validate(defaultWaitlistFields, { email, name: ` ${"n".repeat(80)} ` })).toEqual([]);
    expect(validate(defaultWaitlistFields, { email, name: "n".repeat(81) })).toEqual([
      { name: "name", code: "tooLong", max: 80 },
    ]);
    expect(validate(defaultWaitlistFields, { email, idea: "i".repeat(1001) })).toEqual([
      { name: "idea", code: "tooLong", max: 1000 },
    ]);
    expect(validate(defaultWaitlistFields, { email, company: "c".repeat(121) })).toEqual([
      { name: "company", code: "tooLong", max: 120 },
    ]);
    expect(validate(defaultWaitlistFields, { email: `${"a".repeat(251)}@b.co` })).toEqual([
      { name: "email", code: "tooLong", max: 254 },
    ]);
  });

  test("a choice value must be one of its options; an empty optional choice is fine", () => {
    expect(validate(defaultWaitlistFields, { email, teamSize: "huge" })).toEqual([
      { name: "teamSize", code: "invalidChoice" },
    ]);
    expect(validate(defaultWaitlistFields, { email, experience: "pro" })).toEqual([
      { name: "experience", code: "invalidChoice" },
    ]);
    expect(validate(defaultWaitlistFields, { email, teamSize: "", experience: "not-yet" })).toEqual([]);
    expect(validate(defaultWaitlistFields, { email, teamSize: "11-50", experience: "i-code" })).toEqual([]);
  });

  test("a required choice rejects an empty answer and a value that is not offered", () => {
    const fields: WaitlistField[] = [
      {
        name: "plan",
        kind: "choice",
        label: "Plan",
        required: true,
        options: [{ value: "a", label: "A" }],
      },
    ];
    expect(validate(fields, { plan: "" })).toEqual([{ name: "plan", code: "required" }]);
    expect(validate(fields, { plan: "z" })).toEqual([{ name: "plan", code: "invalidChoice" }]);
    expect(validate(fields, { plan: "a" })).toEqual([]);
  });

  test("an optional email that is filled in still has to have the shape", () => {
    const fields: WaitlistField[] = [{ name: "email", kind: "email", label: "Email", maxLength: 254 }];
    expect(validate(fields, { email: "" })).toEqual([]);
    expect(validate(fields, { email: "nope" })).toEqual([{ name: "email", code: "invalidEmail" }]);
  });
});

describe("buildBody", () => {
  test("trims values and omits empty optional fields", () => {
    const body = buildBody(defaultWaitlistFields, {
      name: "  Ada  ",
      email: "  ada@example.test ",
      idea: "   ",
      company: "",
      teamSize: "  ",
      experience: "not-yet",
      website: "not-a-field",
    });
    expect(body).toEqual({ name: "Ada", email: "ada@example.test", experience: "not-yet" });
  });

  test("the notice text is stored as given, with page and the token", () => {
    const extra: WaitlistExtra = {
      page: "pricing",
      notice: "We use this only to manage your place.",
      turnstileToken: "tok-1",
    };
    const body = buildBody(defaultWaitlistFields, { email: "ada@example.test" }, extra);
    expect(body.notice).toBe("We use this only to manage your place.");
    expect(body).toEqual({
      email: "ada@example.test",
      page: "pricing",
      notice: "We use this only to manage your place.",
      turnstileToken: "tok-1",
    });
  });

  test("an empty page is still sent; an empty notice is left out", () => {
    expect(buildBody(defaultWaitlistFields, { email }, { page: "" })).toEqual({ email, page: "" });
    expect(buildBody(defaultWaitlistFields, { email }, { notice: "" })).toEqual({ email });
  });
});
