import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(["PictureFilesError", "buildCopyMap", "buildThumbMap", "endFile", "endPictureFiles", "linkFullLater", "listVaultFiles", "onCellular", "pickBySize", "thumbFor", "thumbIndexFor", "uploadWithThumb"].sort());
  });
});
