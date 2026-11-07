import "fake-indexeddb/auto";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no object URLs.
let n = 0;
beforeEach(() => {
  window.scrollTo = () => undefined; // jsdom: the viewer restores the page scroll on close
  n = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => `blob:test/${++n}`;
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
