import { describe, expect, test, vi } from "vitest";
import { installProofHooks } from "../src/proof";

describe("T10 proof hooks", () => {
  test("T10 proof hooks: the hook exists only with ?proofHooks=1", () => {
    const clear = vi.fn();
    const without: Record<string, unknown> = {};
    installProofHooks("?latency=0", without, clear);
    installProofHooks("?proofHooks=0", without, clear);
    expect(without.__speedProofHooks).toBeUndefined();
    const withFlag: { __speedProofHooks?: { clearCache(): void } } = {};
    installProofHooks("?entries=5&proofHooks=1", withFlag, clear);
    withFlag.__speedProofHooks!.clearCache();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
