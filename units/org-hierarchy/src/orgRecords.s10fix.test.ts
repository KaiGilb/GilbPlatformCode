// A search hit whose record cannot be read is not offered (it used to be possible to offer an address the search did not name).
import "../test/origins";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-term-slots")>()), attributeSpelling: vi.fn(async (n: string) => n) }));

// eslint-disable-next-line import/first
import { findOrganizationRecords } from "./orgRecords";
// eslint-disable-next-line import/first
import { __resetOrgTerms } from "@kaigilb/gilbplatformcode-org-terms";

const HOST = "https://v.example.test/base";
const e = (id: string) => `${HOST}/e/${id}`;
beforeEach(() => __resetOrgTerms());

describe("the chooser offers only what it can read", () => {
  it("a hit whose read FAILS (throws) is not offered, and its address is nowhere in the answer", async () => {
    const read = vi.fn(async (id: string) => {
      if (id === "boom") throw new Error("403");
      return { id, typeUri: "https://onto.example.test/base/t/Organization", facts: { name: "Nordlys AS" } };
    });
    const search = vi.fn(async () => ({ total: null, ids: [e("ok1"), e("boom")], next: null }));
    const r = await findOrganizationRecords(HOST, "nord", { search: search as never, read: read as never, list: vi.fn() as never });
    expect(r.hits).toEqual([{ uri: e("ok1"), label: "Nordlys AS" }]);
    expect(JSON.stringify(r)).not.toContain("boom");
  });
  it("a hit that reads but has no name is not offered under its address", async () => {
    const read = vi.fn(async (id: string) => ({ id, typeUri: "https://onto.example.test/base/t/Organization", facts: {} }));
    const search = vi.fn(async () => ({ total: null, ids: [e("nameless")], next: null }));
    const r = await findOrganizationRecords(HOST, "x", { search: search as never, read: read as never, list: vi.fn() as never });
    expect(r.hits).toEqual([]);
  });
});
