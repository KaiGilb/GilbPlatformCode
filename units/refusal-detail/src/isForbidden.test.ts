import { describe, expect, it } from "vitest";
import { NoAccessError, VaultBusyError, isForbidden } from "./index";

/** The shapes the other units throw, built here so this unit imports neither. */
class PlatformError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "PlatformError";
  }
}
class RecordForbiddenError extends Error {
  constructor() {
    super("You do not have write access to this record.");
    this.name = "RecordForbiddenError";
  }
}

describe("isForbidden", () => {
  it("is true for NoAccessError, and for an error named NoAccessError from another copy of the class", () => {
    expect(isForbidden(new NoAccessError())).toBe(true);
    expect(isForbidden(Object.assign(new Error("x"), { name: "NoAccessError" }))).toBe(true);
  });
  it("is true for a RecordForbiddenError (by name, with or without a status) and a PlatformError with status 403", () => {
    expect(isForbidden(new RecordForbiddenError())).toBe(true);
    expect(isForbidden(Object.assign(new RecordForbiddenError(), { status: 403 }))).toBe(true);
    expect(isForbidden(new PlatformError(403))).toBe(true);
  });
  it("is true for a plain object with status 403, such as a RefusalDetail", () => {
    expect(isForbidden({ method: "GET", path: "/p", status: 403, sentence: null })).toBe(true);
  });
  it("is false for other refusals and failures", () => {
    for (const s of [401, 404, 412, 428, 500, 503, 0]) expect(isForbidden(new PlatformError(s))).toBe(false);
    expect(isForbidden(new VaultBusyError(503, "busy"))).toBe(false);
    expect(isForbidden(new Error("Failed to fetch"))).toBe(false);
  });
  it("is false for a status that only reads as 403 (a string) and for non-objects", () => {
    expect(isForbidden({ status: "403" })).toBe(false);
    for (const v of [null, undefined, 403, "403", true, 0]) expect(isForbidden(v)).toBe(false);
  });
});
