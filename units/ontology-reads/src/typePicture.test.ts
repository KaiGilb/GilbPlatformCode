import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { normalizeTypeName, typePictureSrc, typeTermUrl } from "./typePicture";
import { resetBaseOrigin, resetLocalRigHosts, resetPublicCorpusOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

beforeEach(() => {
  setBaseOrigin("https://platform.example.test");
  setSystemVaultHosts(["veda.platform.example.test"]);
  setTermOrigin("https://veda.platform.example.test");
});
afterEach(() => {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetPublicCorpusOrigin();
  resetTermOrigin();
});

describe("typePictureSrc", () => {
  test("File entity IRI → public /files URL on the same host", () => {
    expect(
      typePictureSrc({
        "a:typePicture": { "@id": "https://veda.platform.example.test/base/e/e79aevaafavc" },
      }),
    ).toBe("https://veda.platform.example.test/files/e79aevaafavc");
  });

  test("compact typePicture key also works", () => {
    expect(
      typePictureSrc({
        typePicture: { "@id": "https://veda.platform.example.test/base/e/e79aevaafavc" },
      }),
    ).toBe("https://veda.platform.example.test/files/e79aevaafavc");
  });

  test("absence is null — no 404 hunt", () => {
    expect(typePictureSrc({})).toBeNull();
    expect(typePictureSrc(null)).toBeNull();
  });

  test("never treats a .png serve path as the stored object", () => {
    expect(
      typePictureSrc({
        "a:typePicture": { "@id": "https://veda.platform.example.test/base/t/Chair.png" },
      }),
    ).toBeNull();
  });
});

describe("normalizeTypeName", () => {
  test("strips CURIE, URI, veda: prefix", () => {
    expect(normalizeTypeName("Chair")).toBe("Chair");
    expect(normalizeTypeName("t:Chair")).toBe("Chair");
    expect(normalizeTypeName("https://veda.platform.example.test/base/t/Chair")).toBe("Chair");
    expect(normalizeTypeName("veda:Chair")).toBe("Chair");
  });
  test("typeTermUrl is on the ontology host, not the platform apex", () => {
    expect(typeTermUrl("Chair")).toBe("https://veda.platform.example.test/base/t/Chair");
  });
});

