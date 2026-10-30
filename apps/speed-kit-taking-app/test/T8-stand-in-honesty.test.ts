import { describe, expect, test } from "vitest";
import { completeCopy } from "@kaigilb/gilbplatformcode-speed-kit/complete-copy";
import { createFakePlatform, PEOPLE } from "../src/fakePlatform";

const ANN = PEOPLE.ann.vault;
const listUrl = (q: string) => `${PEOPLE.ann.origin}/lws/vault/${encodeURIComponent(ANN)}/records?${q}`;

describe("T8 stand-in honesty", () => {
  const stand = createFakePlatform({ latencyMs: () => 0 });
  const get = (q: string) => stand.client(ANN).fetch(listUrl(q));

  test("T8 stand-in honesty: a records request with a parameter completeCopy does not send answers 400", async () => {
    for (const q of ["type=CatalogEntry&offset=5", "type=CatalogEntry&filter=name%3Dx", "type=CatalogEntry&order=asc", "type=CatalogEntry&include=body&limit=5&since=head&foo=1"]) {
      const res = await get(q);
      expect(res.status, q).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("unsupported_parameter");
    }
    for (const q of ["type=CatalogEntry&since=head", "type=CatalogEntry&include=body&limit=200", "type=CatalogEntry&since=start&include=body&limit=200"]) expect((await get(q)).status, q).toBe(200);
    expect((await get("type=CatalogEntry&since=nonsense")).status).toBe(400);
  });

  test("T8 stand-in honesty: completeCopy walks the stand-in by after= and the since pass (30 rows, 7 per page)", async () => {
    const client = stand.client(ANN);
    const copy = await completeCopy(client, ANN, "t:CatalogEntry", { pageLimit: 7 });
    expect(copy.records).toHaveLength(30);
    expect(copy.records.map((r) => r.body?.name)).toEqual(Array.from({ length: 30 }, (_, i) => `Ann entry ${i + 1}`));
    expect(copy.truncated).toBeUndefined();
    expect(copy.cursor).toBe("p30");
  });
});
