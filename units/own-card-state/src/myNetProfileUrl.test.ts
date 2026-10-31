// New tests for the unit's one setting: where the profile app edits the own card.
import { afterEach, describe, expect, it } from "vitest";
import { myNetProfileUrl, resetMyNetProfileUrl, setMyNetProfileUrl } from "./index";

afterEach(() => resetMyNetProfileUrl());

describe("the profile address setting", () => {
  it("throws, naming the setter, until it is set", () => {
    expect(() => myNetProfileUrl()).toThrow(/setMyNetProfileUrl/);
  });
  it("answers what was set, trimmed and as the URL standard writes it", () => {
    setMyNetProfileUrl("  https://Profile.Example.Test/mynet/profile  ");
    expect(myNetProfileUrl()).toBe("https://profile.example.test/mynet/profile");
  });
  it("keeps the path, the query and the fragment of an http or https address", () => {
    setMyNetProfileUrl("http://localhost:5199/profile?x=1#top");
    expect(myNetProfileUrl()).toBe("http://localhost:5199/profile?x=1#top");
  });
  it("is read when asked: a second setting replaces the first", () => {
    setMyNetProfileUrl("https://a.example.test/p");
    setMyNetProfileUrl("https://b.example.test/p");
    expect(myNetProfileUrl()).toBe("https://b.example.test/p");
  });
  it("refuses what is not an absolute http or https address, and then keeps the earlier one", () => {
    setMyNetProfileUrl("https://a.example.test/p");
    for (const bad of ["", "   ", "profile", "/mynet/profile", "//a.example.test/p", "javascript:alert(1)", "data:text/html,x", "ftp://a.example.test/p", "https://", "https://u:p@a.example.test/p", "https://u@a.example.test/p"]) {
      expect(() => setMyNetProfileUrl(bad), JSON.stringify(bad)).toThrow(TypeError);
      expect(myNetProfileUrl()).toBe("https://a.example.test/p");
    }
  });
  it("messages start with the unit's name", () => {
    expect(() => setMyNetProfileUrl("nope")).toThrow(/^own-card-state:/);
  });
  it("reset forgets the address", () => {
    setMyNetProfileUrl("https://a.example.test/p");
    resetMyNetProfileUrl();
    expect(() => myNetProfileUrl()).toThrow();
  });
});
