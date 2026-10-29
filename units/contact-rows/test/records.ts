// The records the tests' writer reaches: `patchRecord` and `readRecord` are fakes the tests program (in the app they were two vi.mock calls of
// `lib/base/records`), `search` is the fake skill search (the app's second vi.mock, of `searchSkillsRemote`).
import { vi } from "vitest";

/** 412: a concurrent write advanced the record since our ETag. The same class and words as the app's. */
export class RecordConflictError extends Error {
  constructor() {
    super("This record changed elsewhere since you opened it — reloaded the latest.");
    this.name = "RecordConflictError";
  }
}

export type MergePatchValue = unknown;
/** The record as the writer reads it after a 412. */
export interface BaseRecord {
  served?: { facts: Record<string, unknown> } | null;
  etag?: string | null;
}

export const patchRecord = vi.fn();
export const readRecord = vi.fn();
export const search = vi.fn();
