// Ported from the source's `languageEntries.s8fix.test.ts`: the two F7 cases on an entry's code and tag (2) and the F5 block, a catalogue entry that does not answer (4) = 6 of its 14.
// The rules of the marked entry (rules 1 and 2, the second of two, the single mark) are for `language-order` (not in this unit).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLanguageEntries, LANGUAGE_ENTRY_TIMEOUT_MS, LanguageEntryError, languageEntryInfoOf, readLanguageEntry } from "./index";
import { __resetFetchPool } from "@kaigilb/gilbplatformcode-language-fetch-pool";

const B = "https://veda.example.test/base/e/arb000000001";
const E = "https://veda.example.test/base/e/eng000000001";

describe("🔴 F7 · an entry's code and tag", () => {
  it("the real browser reduces both codes to one tag (the premise of the finding)", async () => {
    const { contactLanguageTagFor } = await import("./contactLanguageTag");
    expect(contactLanguageTagFor("ara")).toBe("ar");
    expect(contactLanguageTagFor("arb")).toBe("ar");
  });

  it("an entry carries its own three-letter code", () => {
    expect(languageEntryInfoOf(B, { label: "Standard Arabic", iso6393Code: "arb" }).code).toBe("arb");
    expect(languageEntryInfoOf(B, { label: "x" }).code).toBeNull();
  });
});

describe("🔴 F5 · a catalogue entry that does not answer is given up, and says so", () => {
  beforeEach(() => {
    __resetLanguageEntries();
    __resetFetchPool();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the time is set", () => {
    expect(LANGUAGE_ENTRY_TIMEOUT_MS).toBe(8000);
  });

  it("a read that never answers fails after the time with a plain message, and is not remembered", async () => {
    const hang = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError")))));
    vi.stubGlobal("fetch", hang);
    const err = await readLanguageEntry(E, { timeoutMs: 40 }).catch((x) => x);
    expect(err).toBeInstanceOf(LanguageEntryError);
    expect(String(err.message)).toMatch(/did not answer in time/);
    // not remembered: the next ask asks again
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ label: "English", iso6393Code: "eng" }), { status: 200 })));
    expect((await readLanguageEntry(E)).label).toBe("English");
  });

  it("an unreachable list and a refusing list are told apart and are failures, not another language", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(readLanguageEntry(E)).rejects.toThrow(/could not be reached/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 503 })));
    await expect(readLanguageEntry(E)).rejects.toThrow(/answered 503/);
  });

  it("many entries are read at most 8 at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return new Response(JSON.stringify({ label: "L", iso6393Code: "eng" }), { status: 200 });
      }),
    );
    await Promise.all(Array.from({ length: 100 }, (_, i) => readLanguageEntry(`https://veda.example.test/base/e/lang${String(i).padStart(8, "0")}`)));
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });
});
