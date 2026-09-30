import { describe, expect, it } from "vitest";
import { shareRefusalMessage } from "./shareRefusal";

describe("shareRefusalMessage", () => {
  it("keeps the server message on 403 and says so when there is none", () => {
    expect(shareRefusalMessage(403, JSON.stringify({ message: "  not the owner  " }))).toBe(
      "GilbPlatform refused this share: not the owner",
    );
    expect(shareRefusalMessage(403, "")).toBe(
      "GilbPlatform refused this share and sent no reason.",
    );
    expect(shareRefusalMessage(403, JSON.stringify({ message: "   " }))).toBe(
      "GilbPlatform refused this share and sent no reason.",
    );
    expect(shareRefusalMessage(403, JSON.stringify({ error: "nope", message: 1 }))).toBe(
      "GilbPlatform refused this share and sent no reason.",
    );
  });

  it("uses the raw body when it is not JSON, and trims a non-403 sentence", () => {
    expect(shareRefusalMessage(500, "  boom  ")).toBe("Share failed: 500 boom");
    expect(shareRefusalMessage(500, "")).toBe("Share failed: 500");
    expect(shareRefusalMessage(400, JSON.stringify({ message: "bad" }))).toBe(
      "Share failed: 400 bad",
    );
  });

  it("does not treat the string 403 as the forbidden opening", () => {
    expect(shareRefusalMessage(Number("403"), "nope")).toBe(
      "GilbPlatform refused this share: nope",
    );
    expect(shareRefusalMessage(403.5, "nope")).toBe("Share failed: 403.5 nope");
  });
});
