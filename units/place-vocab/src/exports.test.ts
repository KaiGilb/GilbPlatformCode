// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ attributeSpelling: vi.fn(), typeSpelling: vi.fn(), attributeLabel: vi.fn() }));
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["PlaceVocabUnavailableError", "__resetPlaceVocab", "resolvePlaceVocab"]);
});
