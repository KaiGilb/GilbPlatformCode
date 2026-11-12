import { describe, expect, it } from "vitest";
import * as unit from "./index";
import * as prepare from "./prepare";
import * as vault from "./vault";

describe("the package's exports", () => {
  it('"." is exactly these values', () => {
    expect(Object.keys(unit).sort()).toEqual(["FILES_NOT_REMOVED", "PictureLinkNotKeptError", "PictureSaveError", "addWithPicture", "deleteWithPicture", "linkPicture", "pictureLinkPatch", "pictureOfFacts", "removePicture", "replacePicture"].sort());
  });
  it('"./prepare" is exactly these values', () => {
    expect(Object.keys(prepare).sort()).toEqual(["checkPictureFile", "preparePicture"]);
  });
  it('"./vault" is exactly these values', () => {
    expect(Object.keys(vault).sort()).toEqual(["createVaultPictures", "vaultPictureService"]);
  });
});
