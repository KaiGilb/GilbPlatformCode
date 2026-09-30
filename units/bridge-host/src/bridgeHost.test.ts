import { describe, expect, it } from "vitest";
import { bridgeMayNotApply } from "./bridgeHost";

describe("bridgeMayNotApply", () => {
  it("is false for the same host, even when the scheme differs or a default port is written out", () => {
    expect(
      bridgeMayNotApply("http://app.example.test", "https://app.example.test/base"),
    ).toBe(false);
    expect(
      bridgeMayNotApply("https://app.example.test:443", "https://App.Example.TEST"),
    ).toBe(false);
    expect(bridgeMayNotApply("http://app.example.test:80", "http://app.example.test")).toBe(
      false,
    );
  });

  it("is true when the host or a non-default port differs", () => {
    expect(
      bridgeMayNotApply("http://app.example.test", "https://vault.example.test"),
    ).toBe(true);
    expect(
      bridgeMayNotApply("http://app.example.test:8787", "http://app.example.test"),
    ).toBe(true);
  });

  it("is false when either address cannot be read", () => {
    expect(bridgeMayNotApply("", "https://app.example.test")).toBe(false);
    expect(bridgeMayNotApply("not a url", "also not")).toBe(false);
  });
});
