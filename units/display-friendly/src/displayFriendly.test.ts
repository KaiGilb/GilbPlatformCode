import { describe, expect, it } from "vitest";
import { displayFriendly } from "./displayFriendly";

describe("displayFriendly", () => {
  it("keeps an email and other @ text that is not a URL", () => {
    expect(displayFriendly("person@example.test")).toBe("person@example.test");
    expect(displayFriendly("  not-an-email @ x  ")).toBe("not-an-email @ x");
  });

  it("uses the host only for an empty path or a lone /base path", () => {
    expect(displayFriendly("https://connect.example.test/base")).toBe("connect.example.test");
    expect(displayFriendly("https://connect.example.test/base/")).toBe("connect.example.test");
    expect(displayFriendly("https://connect.example.test")).toBe("connect.example.test");
    expect(displayFriendly("https://connect.example.test:8787/base")).toBe(
      "connect.example.test:8787",
    );
  });

  it("uses the last segment for a longer path", () => {
    expect(displayFriendly("https://id.example.test/base/p/8b0d8f48")).toBe("8b0d8f48");
  });

  it("does not treat /vault as a host unless the caller says so", () => {
    expect(displayFriendly("https://name.example.test/vault")).toBe("vault");
    expect(displayFriendly("https://name.example.test/vault", ["base", "vault"])).toBe(
      "name.example.test",
    );
  });

  it("a trailing slash that is not a URL returns the whole string", () => {
    expect(displayFriendly("note-x/")).toBe("note-x/");
    expect(displayFriendly("folder/note-x")).toBe("note-x");
    expect(displayFriendly("")).toBe("");
  });
});
