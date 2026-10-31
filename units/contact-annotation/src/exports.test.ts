import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "ANNOTATIONS_PATH",
        "ANNOTATIONS_VAULT_PARAM",
        "ANNOTATION_AUTOSAVE_MS",
        "AnnotationError",
        "AnnotationSaveState",
        "AnnotationVaultMismatchError",
        "HINT",
        "HolderNoteGroup",
        "NOTES_VAULT_UNTIED_COPY",
        "PrivateMarker",
        "__resetAnnotationCapability",
        "annotationsFit",
        "growBox",
        "loadHolderAnnotations",
        "sameVault",
        "saveHolderAnnotations",
        "useAnnotationDraft",
      ].sort(),
    );
  });
  it("keeps the route and the delay the card relies on", () => {
    expect(unit.ANNOTATIONS_PATH).toBe("/base/connect/annotations");
    expect(unit.ANNOTATION_AUTOSAVE_MS).toBe(400);
  });
});
