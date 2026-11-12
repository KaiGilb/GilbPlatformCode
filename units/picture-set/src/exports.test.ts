import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(["DEFAULT_UNLINKED_WARNING", "PictureFilesError", "buildCopyMap", "buildThumbMap", "copiesOf", "copiesToEnd", "endFile", "endPictureFiles", "largestUriOf", "linkFullLater", "listVaultFiles", "loadCopyMap", "onCellular", "pickBySize", "storePictureSet", "thumbFor", "thumbIndexFor", "thumbUriOf", "uploadWithThumb"].sort());
  });
});
