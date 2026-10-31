// Test-only. The ontology master as two spies, answered with the term names themselves by `answerMaster` (test/mount.tsx).
import { vi } from "vitest";

export const master = { attributeSpelling: vi.fn(), typeSpelling: vi.fn() };
