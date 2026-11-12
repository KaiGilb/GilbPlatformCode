import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(["SignedImage", "disablePictureDeviceCache", "enablePictureDeviceCache", "forgetPictures", "pictureObjectUrl", "queuePicture", "setPictureQueueLimit", "startPictureSession", "deviceCacheNameFor"].sort());
  });
});
