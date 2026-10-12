// The display probe's LOGIC.
//
// ⚠ WHAT THIS FILE CAN AND CANNOT PROVE, said plainly so nobody reads it as more.
// These tests stub the decoder. They prove the probe ROUTES correctly — that it asks the right
// question, believes the answer, and releases the decoded surface. They prove NOTHING about
// whether any real browser can decode HEIC. That was established by running a real browser
// against a real iPhone HEIC, with a known-good PNG and known-bad garbage as controls.

import { describe, it, expect, vi, afterEach } from "vitest";
import { browserCanDisplay } from "./displayable";

const BLOB = new Blob(["irrelevant — the stub decides"], { type: "image/heic" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the probe believes the browser's own decoder", () => {
  it("says YES when createImageBitmap decodes", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })));
    await expect(browserCanDisplay(BLOB)).resolves.toBe(true);
  });

  it("says NO when createImageBitmap refuses — the measured Chrome-on-HEIC case", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("The source image could not be decoded.");
      }),
    );
    await expect(browserCanDisplay(BLOB)).resolves.toBe(false);
  });

  it("🔴 releases the decoded surface — a 26 MP original is ~100 MB of RGBA held for a yes/no", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 6240, height: 4160, close })));
    await browserCanDisplay(BLOB);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the engine returns a bitmap with no close()", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4, height: 4 })));
    await expect(browserCanDisplay(BLOB)).resolves.toBe(true);
  });
});

describe("the fallback, for engines without createImageBitmap", () => {
  // ⚠ The fallback exists because `createImageBitmap` is not universal. It is exercised here by
  // removing the global — which is exactly the condition it was written for.
  it("falls back to <img> and reports a successful decode", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    class OkImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 100;
      decode = async () => undefined;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", OkImage);
    await expect(browserCanDisplay(BLOB)).resolves.toBe(true);
  });

  it("reports NO when the <img> errors, and still revokes the object URL", async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL });
    class BadImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", BadImage);
    await expect(browserCanDisplay(BLOB)).resolves.toBe(false);
    // A leaked object URL pins the whole decoded picture in memory — the same hazard
    // FaceCropper's own comment records about its preview.
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("reports NO when the <img> loads a header but the PIXELS fail to decode", async () => {
    // 🔴 The header-is-not-a-decode trap, in the browser. It is the same mistake that made the
    // original server diagnosis wrong: `sharp.metadata()` succeeded on an HEIC whose pixels
    // could not be decoded. `decode()` is awaited for exactly this reason.
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    class HeaderOnlyImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 3024;
      decode = async () => {
        throw new Error("decode failed");
      };
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", HeaderOnlyImage);
    await expect(browserCanDisplay(BLOB)).resolves.toBe(false);
  });
});
