import { describe, expect, it } from "vitest";
import { fromMailto, fromTel, toMailto, toTel } from "./mailTel";

describe("mailto and tel", () => {
  it("adds a prefix only when the exact lowercase prefix is absent", () => {
    expect(toMailto("a@b.test")).toBe("mailto:a@b.test");
    expect(toMailto("mailto:a@b.test")).toBe("mailto:a@b.test");
    expect(toMailto("Mailto:a@b.test")).toBe("mailto:Mailto:a@b.test");
    expect(toMailto("")).toBe("mailto:");
    expect(toTel("+1 2")).toBe("tel:+12");
    expect(toTel("tel:+1 2")).toBe("tel:+1 2");
    expect(toTel("Tel:+1")).toBe("tel:Tel:+1");
  });

  it("strips one exact prefix and does not trim", () => {
    expect(fromMailto(undefined)).toBeUndefined();
    expect(fromMailto("a@b.test")).toBe("a@b.test");
    expect(fromMailto("mailto:a@b.test")).toBe("a@b.test");
    expect(fromMailto("mailto:mailto:a@b.test")).toBe("mailto:a@b.test");
    expect(fromMailto(" mailto:a@b.test")).toBe(" mailto:a@b.test");
    expect(fromTel("tel: 1 2")).toBe(" 1 2");
    expect(fromTel(undefined)).toBeUndefined();
  });
});
