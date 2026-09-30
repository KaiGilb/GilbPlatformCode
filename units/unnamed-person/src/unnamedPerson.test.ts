import { describe, expect, it } from "vitest";
import { friendlyUnnamedLabel } from "./unnamedPerson";

describe("friendlyUnnamedLabel", () => {
  it("names the host, strips one www, and never returns the raw address", () => {
    expect(friendlyUnnamedLabel("https://www.example.test/base/p/abc")).toBe(
      "Person on example.test",
    );
    expect(friendlyUnnamedLabel("https://www.www.example.test/a")).toBe(
      "Person on www.example.test",
    );
    expect(friendlyUnnamedLabel("https://WWW.example.test/a")).toBe("Person on example.test");
    expect(friendlyUnnamedLabel("https://example.test:8443/a")).toBe("Person on example.test");
    expect(friendlyUnnamedLabel("not a url")).toBe("Unnamed connection");
    expect(friendlyUnnamedLabel("")).toBe("Unnamed connection");
    expect(friendlyUnnamedLabel("file:///tmp/a")).toBe("Unnamed connection");
  });
});
