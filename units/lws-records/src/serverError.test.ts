// Proof for the ONE Base-failure reader. The three shapes below are not invented fixtures —
// each is a body measured off the real code path, cited at its own case.
import { describe, expect, it } from "vitest";
import { carriesReason, parseServerErrorBody, serverErrorText } from "./serverError";

// The LITERAL 400 body Base returns when a caller names a parentVault it does not know.
// Source: Base `installErrorMapping` (src/server/app.ts) sends `{ error: err.name, message: err.message }`
// for any 4xx; `BadRequestError.name === "BadRequest"` (src/auth/errors.ts); the throw site is
// `POST /base/vault/create-named` (src/routes/vault.ts) — `new BadRequestError(\`parentVault is not a
// known vault entity: ${parentEntity}\`)`.
const HANDLER_SHAPE = {
  error: "BadRequest",
  message: "parentVault is not a known vault entity: https://u.example.test/base",
};

// The OPPOSITE 400 shape from the SAME handler: its `catch` answers
// `reply.code(400); return { error: err.message }` — the sentence IN the `error` field, no
// `message` key at all. Its 404 twin does the same.
const CATCH_SHAPE = {
  error: "That vault name is reserved — choose another",
};

describe("serverErrorText — the reason reaches the user, not the machine name", () => {
  it("CASE 1 (handler shape): shows the SENTENCE, never the word BadRequest", () => {
    const out = serverErrorText(400, HANDLER_SHAPE, "Create vault failed");
    expect(out).toBe("parentVault is not a known vault entity: https://u.example.test/base");
    expect(out).not.toBe("BadRequest");
    expect(out).not.toContain("BadRequest");
  });

  it("CASE 2 (catch shape — sentence lives in `error`): shows it too", () => {
    const out = serverErrorText(400, CATCH_SHAPE, "Create vault failed");
    expect(out).toBe("That vault name is reserved — choose another");
  });

  it("CASE 3 (degenerate — a token and nothing else): never a bare token; carries status + an act", () => {
    const out = serverErrorText(400, { error: "BadRequest" }, "Create vault failed");
    expect(out).not.toBe("BadRequest");
    expect(out).toContain("BadRequest"); // the one thing the server DID say is kept
    expect(out).toContain("400");
    expect(out).toContain("no reason was sent");
    expect(out.length).toBeGreaterThan("BadRequest".length);
  });

  it("CASE 3b (degenerate — an empty body): falls back to the caller's label, still actionable", () => {
    const out = serverErrorText(503, {}, "Create vault failed");
    expect(out).toContain("Create vault failed");
    expect(out).toContain("503");
    expect(out).toContain("no reason was sent");
  });

  it("prefers `message` when BOTH fields carry sentences", () => {
    const out = serverErrorText(
      400,
      { error: "the outer sentence", message: "the specific reason" },
      "x",
    );
    expect(out).toBe("the specific reason");
  });

  it("falls through a TOKEN in `message` to a SENTENCE in `error` (shape-agnostic, not field-order)", () => {
    const out = serverErrorText(409, { message: "Conflict", error: "that host is already taken" }, "x");
    expect(out).toBe("that host is already taken");
  });

  it("accepts the RAW response text, not only a parsed object", () => {
    const out = serverErrorText(400, JSON.stringify(HANDLER_SHAPE), "Create vault failed");
    expect(out).toBe("parentVault is not a known vault entity: https://u.example.test/base");
  });

  it("a non-JSON body (proxy HTML, bare text) is still relayed rather than dropped", () => {
    const out = serverErrorText(502, "upstream connect error or disconnect/reset", "Create vault failed");
    expect(out).toBe("upstream connect error or disconnect/reset");
  });

  it("whitespace-only fields are treated as absent, not as a reason", () => {
    const out = serverErrorText(400, { error: "   ", message: "\n" }, "Create vault failed");
    expect(out).toContain("Create vault failed");
    expect(out).toContain("400");
  });

  it("trims a sentence rather than shipping its padding", () => {
    expect(serverErrorText(400, { message: "  a real reason  " }, "x")).toBe("a real reason");
  });
});

describe("carriesReason — the sentence-vs-token discriminator", () => {
  it("POSITIVE CONTROL: sentences are reasons", () => {
    expect(carriesReason("parentVault is not a known vault entity: https://x/base")).toBe(true);
    expect(carriesReason("You do not own parent vault X — nest only under vaults you have minted")).toBe(true);
  });

  it("NEGATIVE: single machine tokens are not reasons", () => {
    for (const t of ["BadRequest", "Forbidden", "NotFound", "InternalServerError", "AuthError"]) {
      expect(carriesReason(t)).toBe(false);
    }
  });

  it("NEGATIVE: a bare URI names a thing without saying what is wrong with it", () => {
    expect(carriesReason("https://u.example.test/base")).toBe(false);
  });

  it("NEGATIVE: non-strings and blanks", () => {
    expect(carriesReason(undefined)).toBe(false);
    expect(carriesReason(null)).toBe(false);
    expect(carriesReason(42)).toBe(false);
    expect(carriesReason("")).toBe(false);
    expect(carriesReason("   ")).toBe(false);
  });
});

describe("parseServerErrorBody", () => {
  it("parses JSON objects", () => {
    expect(parseServerErrorBody(JSON.stringify(HANDLER_SHAPE))).toEqual(HANDLER_SHAPE);
  });

  it("keeps a non-JSON body as the message", () => {
    expect(parseServerErrorBody("<html>502</html>")).toEqual({ message: "<html>502</html>" });
  });

  it("empty / missing text yields an empty body, never a throw", () => {
    expect(parseServerErrorBody("")).toEqual({});
    expect(parseServerErrorBody(null)).toEqual({});
    expect(parseServerErrorBody(undefined)).toEqual({});
  });
});
