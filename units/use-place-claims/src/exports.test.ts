// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it, vi } from "vitest";
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ attributeSpelling: vi.fn(), typeSpelling: vi.fn(), attributeLabel: vi.fn() }));
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "CATALOGUE_READ_ONLY_SAYS", "CHANGE_FAILED_SAYS", "CHANGE_NOT_CONFIRMED_SAYS", "CHANGE_NOT_KEPT_SAYS", "INCOMPLETE_SAYS", "NOT_SIGNED_IN_CHANGE_SAYS",
    "NOT_SIGNED_IN_REMOVE_SAYS", "NOT_SIGNED_IN_SAVE_SAYS", "NO_VAULT_SAYS", "ORIGIN_UNKNOWN_SAYS", "PARTIAL_SAVE_SAYS", "READ_FAILED_SAYS", "REMOVE_FAILED_SAYS", "REMOVE_NOT_CONFIRMED_SAYS",
    "REMOVE_NOT_DONE_SAYS", "SAVE_FAILED_SAYS", "SAVE_NOT_CONFIRMED_SAYS", "SAVE_NOT_KEPT_SAYS", "VOCAB_DOWN_SAYS", "factsSurvived", "usePlaceClaims",
  ]);
});
