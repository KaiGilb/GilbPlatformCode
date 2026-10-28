// writeSource: where a write's slugs came from, copied from the app.
import { describe, expect, it } from "vitest";
import { writeSource } from "./writeSource";

describe("writeSource", () => {
  it("is nothing for a record with no served keys", () => {
    expect(writeSource({})).toEqual([]);
    expect(writeSource({ entityUri: "https://h.example.test/base/e/a" })).toEqual([]);
  });
  it("is nothing for an empty list of served keys", () => {
    expect(writeSource({ entityUri: "https://h.example.test/base/e/a", servedKeys: [] })).toEqual([]);
  });
  it("is the record's address and its served keys, as one source", () => {
    expect(writeSource({ entityUri: "https://h.example.test/base/e/a", servedKeys: ["unitTag", "measures"] })).toEqual([
      { at: "https://h.example.test/base/e/a", servedKeys: ["unitTag", "measures"] },
    ]);
  });
  it("names no address as null", () => {
    expect(writeSource({ servedKeys: ["unitTag"] })).toEqual([{ at: null, servedKeys: ["unitTag"] }]);
  });
});
