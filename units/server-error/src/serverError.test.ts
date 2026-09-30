import { describe, expect, it } from "vitest";
import {
  NO_REASON_TAIL,
  carriesReason,
  parseServerErrorBody,
  serverErrorText,
  serverReasonOrNull,
} from "./serverError";

const HANDLER_SHAPE = {
  error: "BadRequest",
  message: "parentVault is not a known vault entity: https://example.test/base",
};

const CATCH_SHAPE = {
  error: "That vault name is reserved — choose another",
};

describe("serverErrorText", () => {
  it("shows the sentence in message and hides the token", () => {
    const out = serverErrorText(400, HANDLER_SHAPE, "Create vault failed");
    expect(out).toBe("parentVault is not a known vault entity: https://example.test/base");
    expect(out).not.toContain("BadRequest");
  });

  it("shows a sentence that lives in error", () => {
    expect(serverErrorText(400, CATCH_SHAPE, "Create vault failed")).toBe(
      "That vault name is reserved — choose another",
    );
  });

  it("never shows a bare token", () => {
    const out = serverErrorText(400, { error: "BadRequest" }, "Create vault failed");
    expect(out).toBe(`BadRequest (HTTP 400) — ${NO_REASON_TAIL}`);
  });

  it("uses the fallback label when the body is empty", () => {
    expect(serverErrorText(503, {}, "Create vault failed")).toBe(
      `Create vault failed (HTTP 503) — ${NO_REASON_TAIL}`,
    );
  });

  it("defaults the label when the caller omits it", () => {
    expect(serverErrorText(500, {})).toBe(`Request failed (HTTP 500) — ${NO_REASON_TAIL}`);
  });

  it("prefers message when both fields are sentences", () => {
    expect(
      serverErrorText(400, { error: "the outer sentence", message: "the specific reason" }, "x"),
    ).toBe("the specific reason");
  });

  it("skips a token in message and uses a sentence in error", () => {
    expect(
      serverErrorText(409, { message: "Conflict", error: "that host is already taken" }, "x"),
    ).toBe("that host is already taken");
  });

  it("accepts raw response text", () => {
    expect(serverErrorText(400, JSON.stringify(HANDLER_SHAPE), "Create vault failed")).toBe(
      "parentVault is not a known vault entity: https://example.test/base",
    );
  });

  it("relays a non-JSON body", () => {
    expect(serverErrorText(502, "upstream connect error or disconnect/reset", "Create vault failed")).toBe(
      "upstream connect error or disconnect/reset",
    );
  });

  it("treats whitespace-only fields as absent", () => {
    expect(serverErrorText(400, { error: "   ", message: "\n" }, "Create vault failed")).toBe(
      `Create vault failed (HTTP 400) — ${NO_REASON_TAIL}`,
    );
  });

  it("trims a sentence", () => {
    expect(serverErrorText(400, { message: "  a real reason  " }, "x")).toBe("a real reason");
  });

  it("ignores a numeric message rather than stringifying it", () => {
    expect(serverErrorText(400, { message: 42 }, "Create vault failed")).toBe(
      `Create vault failed (HTTP 400) — ${NO_REASON_TAIL}`,
    );
  });

  it("stringifies a JSON array into a token line", () => {
    expect(serverErrorText(400, "[1,2]", "Create vault failed")).toBe(
      `1,2 (HTTP 400) — ${NO_REASON_TAIL}`,
    );
  });
});

describe("carriesReason", () => {
  it("accepts sentences", () => {
    expect(carriesReason("parentVault is not a known vault entity: https://example.test/base")).toBe(true);
    expect(carriesReason("You do not own parent vault X — nest only under vaults you have minted")).toBe(
      true,
    );
    expect(carriesReason("Bad Request")).toBe(true);
  });

  it("rejects single tokens and a bare address", () => {
    for (const t of ["BadRequest", "Forbidden", "NotFound", "InternalServerError", "AuthError"]) {
      expect(carriesReason(t)).toBe(false);
    }
    expect(carriesReason("https://example.test/base")).toBe(false);
  });

  it("rejects non-strings and blanks", () => {
    expect(carriesReason(undefined)).toBe(false);
    expect(carriesReason(null)).toBe(false);
    expect(carriesReason(42)).toBe(false);
    expect(carriesReason("")).toBe(false);
    expect(carriesReason("   ")).toBe(false);
    expect(carriesReason(" a ")).toBe(false);
  });
});

describe("parseServerErrorBody", () => {
  it("parses a JSON object", () => {
    expect(parseServerErrorBody(JSON.stringify(HANDLER_SHAPE))).toEqual(HANDLER_SHAPE);
  });

  it("keeps non-JSON text as message", () => {
    expect(parseServerErrorBody("<html>502</html>")).toEqual({ message: "<html>502</html>" });
  });

  it("stringifies a JSON scalar", () => {
    expect(parseServerErrorBody('"boom"')).toEqual({ message: "boom" });
    expect(parseServerErrorBody("42")).toEqual({ message: "42" });
  });

  it("returns an empty body for empty text and does not throw", () => {
    expect(parseServerErrorBody("")).toEqual({});
    expect(parseServerErrorBody(null)).toEqual({});
    expect(parseServerErrorBody(undefined)).toEqual({});
  });
});

describe("serverReasonOrNull", () => {
  it("returns the sentence", () => {
    expect(serverReasonOrNull(HANDLER_SHAPE)).toBe(
      "parentVault is not a known vault entity: https://example.test/base",
    );
  });

  it("returns null for a token", () => {
    expect(serverReasonOrNull({ error: "BadRequest" })).toBeNull();
  });

  it("returns null for an empty body", () => {
    expect(serverReasonOrNull({})).toBeNull();
    expect(serverReasonOrNull("")).toBeNull();
  });
});
