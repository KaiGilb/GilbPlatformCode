// Ported from the source's three entityWriteAccess test files, then new cases. The source file held the pure decision and the refusal memory in
// one module; the pure half is now the unit `record-write`, so the source's calls of `recordWriteAllowed(vault, record, keys)` are run through
// this unit's own entry, `useEntityCanWrite(vault, record, keys)`, which hands `record-write` the memory's answer: the same expectations, the
// path that ships. See the README for which source cases are where.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ENTITY_READ_ONLY_REASON as RECORD_WRITE_REASON, sessionIdentityKeys } from "@kaigilb/gilbplatformcode-record-write";
import {
  ENTITY_READ_ONLY_REASON,
  clearEntityWriteDenials,
  entityWriteAllowed,
  isEntityWriteDenied,
  markEntityWriteDenied,
  useEntityCanWrite,
  useMarkEntityWriteDenied,
} from "./entityWriteAccess";

const ME = "https://id.platform.example.test/base/p/me";
const ALIAS = "https://kaikai.platform.example.test/i";
const SOMEONE_ELSE = "https://id.platform.example.test/base/p/someone-else";
const KEYS = sessionIdentityKeys(ME, ALIAS);

type Frame = { id: string; facts?: Record<string, string> };
/** The source's `recordWriteAllowed(vault, record, keys)`, through the hook this unit ships. */
const canWrite = (vault: boolean, record: Frame | string | null | undefined, keys?: readonly string[] | null) =>
  renderHook(() => useEntityCanWrite(vault, record, keys)).result.current;

afterEach(() => {
  cleanup();
  clearEntityWriteDenials();
});

describe("entityWriteAccess (ported)", () => {
  it("allows write when vault write is on and record is not pinned", () => {
    expect(entityWriteAllowed(true, "rec-a")).toBe(true);
    expect(isEntityWriteDenied("rec-a")).toBe(false);
  });

  it("denies when vault write is off", () => {
    expect(entityWriteAllowed(false, "rec-a")).toBe(false);
  });

  it("pins after markEntityWriteDenied so vault write no longer unlocks that record", () => {
    markEntityWriteDenied("rec-read-only");
    expect(isEntityWriteDenied("rec-read-only")).toBe(true);
    expect(entityWriteAllowed(true, "rec-read-only")).toBe(false);
    // Other records on the same vault stay writable.
    expect(entityWriteAllowed(true, "rec-write-ok")).toBe(true);
  });

  it("exposes an honest read-only reason string", () => {
    expect(ENTITY_READ_ONLY_REASON.toLowerCase()).toContain("not edit");
  });

  it("recordWriteAllowed: directReader only → read glyph even when vault has write", () => {
    const rec = { id: "note-read", facts: { title: "R", directReader: ME } };
    expect(canWrite(true, rec, KEYS)).toBe(false);
  });

  it("recordWriteAllowed: directWriter → write (alias or principal)", () => {
    const byPrincipal = { id: "note-w1", facts: { title: "W", directReader: ME, directWriter: ME } };
    const byAlias = { id: "note-w2", facts: { title: "W", directWriter: ALIAS } };
    expect(canWrite(true, byPrincipal, KEYS)).toBe(true);
    expect(canWrite(true, byAlias, KEYS)).toBe(true);
  });

  it("recordWriteAllowed: no grant attrs → vault write (owner path)", () => {
    expect(canWrite(true, { id: "own", facts: { title: "Mine" } }, KEYS)).toBe(true);
  });

  it("recordWriteAllowed: grants for someone else → still vault write for owner", () => {
    const rec = { id: "shared-out", facts: { title: "Out", directReader: "https://other.example.test/i" } };
    expect(canWrite(true, rec, KEYS)).toBe(true);
  });
});

describe("the server's read-back self-grant is not a read-only share (ported)", () => {
  it("1. uploader keeps write: directReader names me AND fileStoredBy names me", () => {
    const uploadedByMe = { id: "file-mine", facts: { fileName: "photo.png", directReader: ME, fileStoredBy: ME } };
    expect(canWrite(true, uploadedByMe, KEYS)).toBe(true);
  });

  it("2. recipient stays read-only: directReader names me but fileStoredBy names someone else", () => {
    const sharedToMe = { id: "file-theirs", facts: { fileName: "photo.png", directReader: ME, fileStoredBy: SOMEONE_ELSE } };
    expect(canWrite(true, sharedToMe, KEYS)).toBe(false);
  });

  it("3. no provenance on the frame → read-only, exactly as before this change", () => {
    const noProvenance = { id: "file-unknown", facts: { fileName: "photo.png", directReader: ME } };
    expect(canWrite(true, noProvenance, KEYS)).toBe(false);
  });

  it("11. unparseable provenance → read-only, never a manufactured write", () => {
    const garbage = { id: "file-garbage", facts: { fileName: "photo.png", directReader: ME, fileStoredBy: "{not json at all" } };
    expect(canWrite(true, garbage, KEYS)).toBe(false);
  });

  it("4. tolerates the reference-edge encoding: fileStoredBy as {\"@id\": …}", () => {
    const jsonEncoded = { id: "file-json", facts: { fileName: "photo.png", directReader: ME, fileStoredBy: JSON.stringify({ "@id": ME }) } };
    expect(canWrite(true, jsonEncoded, KEYS)).toBe(true);
  });

  it("5. reads the a:-prefixed spelling too, not only the bare frame slug", () => {
    const prefixed = { id: "file-prefixed", facts: { fileName: "photo.png", "a:directReader": ME, "a:fileStoredBy": ME } };
    expect(canWrite(true, prefixed, KEYS)).toBe(true);
  });

  it("10. resolves provenance against the short WebID alias, not only the principal", () => {
    const byAlias = { id: "file-alias", facts: { fileName: "photo.png", directReader: ME, fileStoredBy: ALIAS } };
    expect(canWrite(true, byAlias, KEYS)).toBe(true);
  });

  it("6. vault-level write is still the floor — own upload on a read-only vault stays read-only", () => {
    const uploadedByMe = { id: "file-mine-ro-vault", facts: { fileName: "photo.png", directReader: ME, fileStoredBy: ME } };
    expect(canWrite(false, uploadedByMe, KEYS)).toBe(false);
  });

  it("7. a real 403 refusal still wins over own-upload provenance", () => {
    const uploadedByMe = { id: "file-mine-pinned", facts: { fileName: "photo.png", directReader: ME, fileStoredBy: ME } };
    markEntityWriteDenied("file-mine-pinned");
    expect(canWrite(true, uploadedByMe, KEYS)).toBe(false);
  });

  it("8. a grant naming only someone else leaves the owner's vault write intact", () => {
    const sharedOut = { id: "file-shared-out", facts: { fileName: "photo.png", directReader: SOMEONE_ELSE, fileStoredBy: ME } };
    expect(canWrite(true, sharedOut, KEYS)).toBe(true);
  });

  it("9. an explicit directWriter grant wins regardless of who stored it", () => {
    const explicitWriter = { id: "file-writer-grant", facts: { fileName: "photo.png", directReader: ME, directWriter: ME, fileStoredBy: SOMEONE_ELSE } };
    expect(canWrite(true, explicitWriter, KEYS)).toBe(true);
  });
});

describe("the memory of refusals", () => {
  it("an unknown, empty, null or undefined id is not denied", () => {
    markEntityWriteDenied("known");
    for (const id of ["nope", "", null, undefined]) expect(isEntityWriteDenied(id)).toBe(false);
    expect(isEntityWriteDenied("known")).toBe(true);
  });

  it("an empty id is never pinned", () => {
    markEntityWriteDenied("");
    expect(isEntityWriteDenied("")).toBe(false);
  });

  it("a pin lasts until it is cleared, for every record it was set for", () => {
    markEntityWriteDenied("a");
    markEntityWriteDenied("b");
    expect(isEntityWriteDenied("a") && isEntityWriteDenied("b")).toBe(true);
    clearEntityWriteDenials();
    expect(isEntityWriteDenied("a") || isEntityWriteDenied("b")).toBe(false);
    expect(entityWriteAllowed(true, "a")).toBe(true);
  });

  it("the id is matched exactly: case and white space count", () => {
    markEntityWriteDenied("Rec-1");
    expect(isEntityWriteDenied("rec-1")).toBe(false);
    expect(isEntityWriteDenied("Rec-1 ")).toBe(false);
    expect(isEntityWriteDenied("Rec-1")).toBe(true);
  });
});

describe("entityWriteAllowed (the stateful one)", () => {
  it("no id is not writable, even with vault write", () => {
    expect(entityWriteAllowed(true, null)).toBe(false);
    expect(entityWriteAllowed(true, undefined)).toBe(false);
    expect(entityWriteAllowed(true, "")).toBe(false);
  });
  it("vault write off is not writable, pinned or not", () => {
    markEntityWriteDenied("p");
    expect(entityWriteAllowed(false, "p")).toBe(false);
    expect(entityWriteAllowed(false, "q")).toBe(false);
  });
  it("is the unit record-write's answer with this memory's pin: the pin flips it, the clear flips it back", () => {
    expect(entityWriteAllowed(true, "flip")).toBe(true);
    markEntityWriteDenied("flip");
    expect(entityWriteAllowed(true, "flip")).toBe(false);
    clearEntityWriteDenials();
    expect(entityWriteAllowed(true, "flip")).toBe(true);
  });
});

describe("useEntityCanWrite", () => {
  it("no record is not writable", () => {
    expect(canWrite(true, null)).toBe(false);
    expect(canWrite(true, undefined)).toBe(false);
  });

  it("a bare id is the stateful entityWriteAllowed: vault write and not pinned", () => {
    expect(canWrite(true, "id-1")).toBe(true);
    expect(canWrite(false, "id-1")).toBe(false);
    markEntityWriteDenied("id-1");
    expect(canWrite(true, "id-1")).toBe(false);
    expect(canWrite(true, "")).toBe(false);
  });

  it("a record with an empty id is not writable", () => {
    expect(canWrite(true, { id: "", facts: {} }, KEYS)).toBe(false);
  });

  it("a pin for the record's id beats a writer grant", () => {
    markEntityWriteDenied("pinned-writer");
    expect(canWrite(true, { id: "pinned-writer", facts: { directWriter: ME } }, KEYS)).toBe(false);
  });

  it("a pin for another record changes nothing", () => {
    markEntityWriteDenied("other");
    expect(canWrite(true, { id: "mine", facts: {} }, KEYS)).toBe(true);
  });

  it("identity keys are optional: with none, a grant names 'someone else', so the vault write stands", () => {
    expect(canWrite(true, { id: "nokeys", facts: { directReader: ME } })).toBe(true);
    expect(canWrite(true, { id: "nokeys", facts: { directReader: ME } }, null)).toBe(true);
    expect(canWrite(true, { id: "nokeys", facts: { directReader: ME } }, [])).toBe(true);
  });

  it("flips closed by itself when a pin is added: the screen re-renders", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useEntityCanWrite(true, "live-1");
    });
    expect(result.current).toBe(true);
    const before = renders;
    act(() => markEntityWriteDenied("live-1"));
    expect(result.current).toBe(false);
    expect(renders).toBeGreaterThan(before);
  });

  it("flips open again when the pins are cleared", () => {
    markEntityWriteDenied("live-2");
    const { result } = renderHook(() => useEntityCanWrite(true, "live-2"));
    expect(result.current).toBe(false);
    act(() => clearEntityWriteDenials());
    expect(result.current).toBe(true);
  });

  it("every mounted screen re-renders on one pin", () => {
    const a = renderHook(() => useEntityCanWrite(true, "shared"));
    const b = renderHook(() => useEntityCanWrite(true, { id: "shared", facts: {} }, KEYS));
    act(() => markEntityWriteDenied("shared"));
    expect([a.result.current, b.result.current]).toEqual([false, false]);
  });

  it("a pin that was already there does not re-render again (one notice per new pin)", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useEntityCanWrite(true, "once");
    });
    act(() => markEntityWriteDenied("once"));
    const after = renders;
    act(() => markEntityWriteDenied("once"));
    expect(renders).toBe(after);
  });

  it("clearing when nothing is pinned does not re-render", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useEntityCanWrite(true, "nothing");
    });
    const before = renders;
    act(() => clearEntityWriteDenials());
    expect(renders).toBe(before);
  });

  it("an empty id is not announced", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useEntityCanWrite(true, "x");
    });
    const before = renders;
    act(() => markEntityWriteDenied(""));
    expect(renders).toBe(before);
  });

  it("after the screen goes away a pin is still taken, and nothing throws", () => {
    const { unmount } = renderHook(() => useEntityCanWrite(true, "gone"));
    unmount();
    expect(() => markEntityWriteDenied("gone")).not.toThrow();
    expect(isEntityWriteDenied("gone")).toBe(true);
  });
});

describe("useMarkEntityWriteDenied", () => {
  it("returns a function that pins the id", () => {
    const { result } = renderHook(() => useMarkEntityWriteDenied());
    act(() => result.current("via-hook"));
    expect(isEntityWriteDenied("via-hook")).toBe(true);
  });

  it("the function is the same on every render (safe in an effect's dependencies)", () => {
    const { result, rerender } = renderHook(() => useMarkEntityWriteDenied());
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });

  it("pinning through it flips a screen that reads the same memory", () => {
    const mark = renderHook(() => useMarkEntityWriteDenied());
    const read = renderHook(() => useEntityCanWrite(true, "via-hook-2"));
    expect(read.result.current).toBe(true);
    act(() => mark.result.current("via-hook-2"));
    expect(read.result.current).toBe(false);
  });
});

describe("the reason", () => {
  it("is record-write's sentence, not a second copy of it", () => {
    expect(ENTITY_READ_ONLY_REASON).toBe(RECORD_WRITE_REASON);
    expect(ENTITY_READ_ONLY_REASON).toBe("You can read this item but not edit it.");
  });
});
