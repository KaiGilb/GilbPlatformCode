import { describe, expect, it } from "vitest";
import {
  phoneForUri,
  pickContactActions,
  resolvableSocialHref,
  toMailtoHref,
} from "./contactActions";

describe("phoneForUri", () => {
  it("strips a leading tel: and spaces, and keeps other characters", () => {
    expect(phoneForUri("  +47 123 45  ")).toBe("+4712345");
    expect(phoneForUri("TEL:+47 123")).toBe("+47123");
    expect(phoneForUri("(47) 123-45")).toBe("(47)123-45");
  });
});

describe("toMailtoHref", () => {
  it("adds mailto: unless it is already there", () => {
    expect(toMailtoHref("a@b.c")).toBe("mailto:a@b.c");
    expect(toMailtoHref(" Mailto:A@b.c ")).toBe("Mailto:A@b.c");
  });
});

describe("resolvableSocialHref", () => {
  it("rejects blanks, @names, and unsafe schemes", () => {
    expect(resolvableSocialHref("")).toBeNull();
    expect(resolvableSocialHref("  ")).toBeNull();
    expect(resolvableSocialHref("@someone")).toBeNull();
    expect(resolvableSocialHref("javascript:alert(1)")).toBeNull();
    expect(resolvableSocialHref("JAVASCRIPT:alert(1)")).toBeNull();
    expect(resolvableSocialHref("data:text/html,hi")).toBeNull();
    expect(resolvableSocialHref("vbscript:msg")).toBeNull();
    expect(resolvableSocialHref("ftp://example.test/a")).toBeNull();
    expect(resolvableSocialHref("mailto:a@b.c")).toBeNull();
  });

  it("accepts http and https, and adds https when there is no scheme", () => {
    expect(resolvableSocialHref("https://example.test/a")).toBe("https://example.test/a");
    expect(resolvableSocialHref("example.test/someone")).toBe("https://example.test/someone");
    expect(resolvableSocialHref("https://example.test")).toBe("https://example.test/");
    expect(resolvableSocialHref("HTTP://Example.Test/A")).toBe("http://example.test/A");
  });

  it("rejects text that is not a url", () => {
    expect(resolvableSocialHref("not a url")).toBeNull();
  });

  it("treats a single word as a host", () => {
    expect(resolvableSocialHref("foo")).toBe("https://foo/");
  });
});

describe("pickContactActions", () => {
  it("fills phone, sms, then email, and stops at 3", () => {
    const actions = pickContactActions({
      phones: [" +47 1 ", " +99 "],
      emails: ["a@b.c", "c@d.e"],
      socials: ["https://example.test/a"],
    });
    expect(actions.map((a) => a.kind)).toEqual(["phone", "sms", "email"]);
    expect(actions.map((a) => a.label)).toEqual(["Call", "SMS", "Email"]);
    expect(actions[0]).toEqual({ kind: "phone", href: "tel:+471", value: "+47 1", label: "Call" });
    expect(actions[1]?.href).toBe("sms:+471");
    expect(actions[2]?.href).toBe("mailto:a@b.c");
  });

  it("does not offer SMS without a phone, and skips a bad social", () => {
    const actions = pickContactActions({
      emails: ["a@b.c"],
      socials: ["@someone", "javascript:alert(1)", "example.test/a", "https://example.test/b"],
    });
    expect(actions.map((a) => a.kind)).toEqual(["email", "social", "social"]);
    expect(actions[1]?.href).toBe("https://example.test/a");
    expect(actions[1]?.value).toBe("example.test/a");
  });

  it("keeps the social text as passed, including spaces, while the href is trimmed", () => {
    const actions = pickContactActions({ socials: ["  example.test/a  "] }, 1);
    expect(actions[0]?.href).toBe("https://example.test/a");
    expect(actions[0]?.value).toBe("  example.test/a  ");
  });

  it("uses max, and treats max below 1 as nothing", () => {
    const source = { phones: ["1"], emails: ["a@b.c"], socials: ["https://example.test/a"] };
    expect(pickContactActions(source, 1).map((a) => a.kind)).toEqual(["phone"]);
    expect(pickContactActions(source, 4).map((a) => a.kind)).toEqual(["phone", "sms", "email", "social"]);
    expect(pickContactActions(source, 0)).toEqual([]);
    expect(pickContactActions(source, -1)).toEqual([]);
  });

  it("returns nothing when the source is empty", () => {
    expect(pickContactActions({})).toEqual([]);
    expect(pickContactActions({ phones: ["  "], emails: [""], socials: ["@x"] })).toEqual([]);
  });
});
