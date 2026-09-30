import { describe, expect, it } from "vitest";
import {
  ENTITY_READ_ONLY_REASON,
  entityWriteAllowed,
  recordWriteAllowed,
  sessionIdentityKeys,
} from "./recordWrite";

const ME = "https://id.example.test/base/p/me";
const ALIAS = "https://person.example.test/i";
const OTHER = "https://other.example.test/i";
const KEYS = sessionIdentityKeys(ME, ALIAS);

describe("sessionIdentityKeys", () => {
  it("keeps a trimmed principal and then a trimmed short address", () => {
    expect(sessionIdentityKeys(`  ${ME}  `, `  ${ALIAS}  `)).toEqual([ME, ALIAS]);
  });

  it("drops blanks and does not invent a second key", () => {
    expect(sessionIdentityKeys("", "   ")).toEqual([]);
    expect(sessionIdentityKeys(ME, null)).toEqual([ME]);
    expect(sessionIdentityKeys(null, ALIAS)).toEqual([ALIAS]);
  });
});

describe("recordWriteAllowed", () => {
  it("is false when the vault cannot write, the record is missing, or the id is blank", () => {
    expect(recordWriteAllowed(false, { id: "a", facts: {} }, KEYS, false)).toBe(false);
    expect(recordWriteAllowed(true, null, KEYS, false)).toBe(false);
    expect(recordWriteAllowed(true, { id: "" }, KEYS, false)).toBe(false);
  });

  it("is false when this session was already refused, even if the frame names a writer", () => {
    expect(
      recordWriteAllowed(true, { id: "a", facts: { directWriter: ME } }, KEYS, true),
    ).toBe(false);
  });

  it("is true when the frame names no reader and no writer", () => {
    expect(recordWriteAllowed(true, { id: "own", facts: { title: "Mine" } }, KEYS, false)).toBe(
      true,
    );
    expect(recordWriteAllowed(true, { id: "own" }, KEYS, false)).toBe(true);
  });

  it("is false when only a reader grant names this session", () => {
    expect(
      recordWriteAllowed(true, { id: "n", facts: { directReader: ME } }, KEYS, false),
    ).toBe(false);
  });

  it("is true when a writer grant names the principal or the short address", () => {
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { directReader: ME, directWriter: ME } },
        KEYS,
        false,
      ),
    ).toBe(true);
    expect(
      recordWriteAllowed(true, { id: "n", facts: { directWriter: ALIAS } }, KEYS, false),
    ).toBe(true);
  });

  it("is true when the grants name someone else", () => {
    expect(
      recordWriteAllowed(true, { id: "n", facts: { directReader: OTHER } }, KEYS, false),
    ).toBe(true);
  });

  it("matches a reader or writer with different letter case, including the path", () => {
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { directReader: ME.toUpperCase() } },
        KEYS,
        false,
      ),
    ).toBe(false);
  });

  it("splits a reader list on a comma or a newline, with or without a space", () => {
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { directReader: `${OTHER},${ME}` } },
        KEYS,
        false,
      ),
    ).toBe(false);
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { directWriter: `${OTHER}\n${ALIAS}` } },
        KEYS,
        false,
      ),
    ).toBe(true);
  });

  it("does not unwrap a JSON reader or writer grant", () => {
    const json = JSON.stringify({ "@id": ME });
    expect(
      recordWriteAllowed(true, { id: "n", facts: { directReader: json } }, KEYS, false),
    ).toBe(true);
    expect(
      recordWriteAllowed(true, { id: "n", facts: { directWriter: json } }, KEYS, false),
    ).toBe(true);
  });

  it("treats a comma-only grant as no grant", () => {
    expect(
      recordWriteAllowed(true, { id: "n", facts: { directReader: " , " } }, KEYS, false),
    ).toBe(true);
  });

  it("keeps write when the reader grant is this session and the row says this session stored it", () => {
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { directReader: ME, fileStoredBy: ME } },
        KEYS,
        false,
      ),
    ).toBe(true);
  });

  it("stays read-only when the reader is this session and someone else stored the row", () => {
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { directReader: ME, fileStoredBy: OTHER } },
        KEYS,
        false,
      ),
    ).toBe(false);
  });

  it("stays read-only when the stored-by value is not JSON and starts with a brace", () => {
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { directReader: ME, fileStoredBy: "{not json at all" } },
        KEYS,
        false,
      ),
    ).toBe(false);
  });

  it("reads a stored-by JSON @id, and the prefixed spellings", () => {
    expect(
      recordWriteAllowed(
        true,
        {
          id: "n",
          facts: {
            directReader: ME,
            fileStoredBy: JSON.stringify({ "@id": `  ${ME}  ` }),
          },
        },
        KEYS,
        false,
      ),
    ).toBe(true);
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { "a:directReader": ME, "a:fileStoredBy": ALIAS } },
        KEYS,
        false,
      ),
    ).toBe(true);
  });

  it("does not treat stored-by as a writer when this session is not the reader", () => {
    expect(
      recordWriteAllowed(
        true,
        { id: "n", facts: { directReader: OTHER, fileStoredBy: ME } },
        KEYS,
        false,
      ),
    ).toBe(true);
  });

  it("is true for an empty identity list when grants name other people", () => {
    expect(
      recordWriteAllowed(true, { id: "n", facts: { directReader: OTHER } }, [], false),
    ).toBe(true);
  });

  it("uses the ordinary lowercasing, not a locale", () => {
    const previous = sessionIdentityKeys("I", null);
    expect(
      recordWriteAllowed(true, { id: "n", facts: { directReader: "i" } }, previous, false),
    ).toBe(false);
  });
});

describe("entityWriteAllowed", () => {
  it("is vault write and not the pin, and does not read facts", () => {
    expect(entityWriteAllowed(true, "rec-a", false)).toBe(true);
    expect(entityWriteAllowed(false, "rec-a", false)).toBe(false);
    expect(entityWriteAllowed(true, "rec-a", true)).toBe(false);
    expect(entityWriteAllowed(true, "", false)).toBe(false);
    expect(entityWriteAllowed(true, null, false)).toBe(false);
  });
});

describe("reason", () => {
  it("is the one sentence", () => {
    expect(ENTITY_READ_ONLY_REASON).toBe("You can read this item but not edit it.");
  });
});
