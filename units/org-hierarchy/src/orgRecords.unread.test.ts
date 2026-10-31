// New. A hit the search named but that could not be read makes the answer incomplete, never "no such organization".
import "../test/origins";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-term-slots")>()), attributeSpelling: vi.fn(async (n: string) => n) }));

// eslint-disable-next-line import/first
import { findOrganizationRecords } from "./orgRecords";
// eslint-disable-next-line import/first
import { __resetOrgTerms } from "@kaigilb/gilbplatformcode-org-terms";

const HOST = "https://v.example.test/base";
const ORG = "https://onto.example.test/base/t/Organization";
const e = (id: string) => `${HOST}/e/${id}`;
beforeEach(() => __resetOrgTerms());

const ask = (ids: string[], read: (id: string) => Promise<unknown>, next: string | null = null) =>
  findOrganizationRecords(HOST, "nord", {
    search: vi.fn(async () => ({ total: null, ids: ids.map(e), next })) as never,
    read: read as never,
    list: vi.fn() as never,
  });

describe("a hit that failed to read makes the answer incomplete", () => {
  it("a read that throws: the others are offered and complete is false", async () => {
    const r = await ask(["ok1", "boom"], async (id) => {
      if (id === "boom") throw new Error("503");
      return { id, typeUri: ORG, facts: { name: "Nordlys AS" } };
    });
    expect(r.hits).toEqual([{ uri: e("ok1"), label: "Nordlys AS" }]);
    expect(r.complete).toBe(false);
  });
  it("a record that is not served to the viewer (the read answers nothing): complete is false", async () => {
    const r = await ask(["ok1", "hidden"], async (id) => (id === "hidden" ? null : { id, typeUri: ORG, facts: { name: "Nordlys AS" } }));
    expect(r.hits).toHaveLength(1);
    expect(r.complete).toBe(false);
  });
  it("only hits that failed: no hit and complete is false (not 'no such organization')", async () => {
    const r = await ask(["a", "b"], async () => {
      throw new Error("503");
    });
    expect(r).toEqual({ hits: [], complete: false });
  });
  it("a hit that reads but is not an organization, or has no name, is not a failure: complete stays true", async () => {
    const r = await ask(["person", "nameless", "ok1"], async (id) =>
      id === "person" ? { id, typeUri: "https://onto.example.test/base/t/Person", facts: { name: "Kari" } } : id === "nameless" ? { id, typeUri: ORG, facts: {} } : { id, typeUri: ORG, facts: { name: "Nordlys AS" } },
    );
    expect(r.hits).toEqual([{ uri: e("ok1"), label: "Nordlys AS" }]);
    expect(r.complete).toBe(true);
  });
  it("every hit read and no next page: complete is true; with a next page it is false even if every hit read", async () => {
    const ok = async (id: string) => ({ id, typeUri: ORG, facts: { name: "Nordlys AS" } });
    expect((await ask(["a"], ok)).complete).toBe(true);
    expect((await ask(["a"], ok, "next-page")).complete).toBe(false);
  });
});
