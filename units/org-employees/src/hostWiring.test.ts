// The default wiring of readOrgEmployeesPage: which host member and which peer answers each read, with what arguments, how often.
// The peers that reach the platform (the find, the record read, the term spellings, the card vocabulary) are replaced; the host is the fake.
import { beforeEach, describe, expect, it, vi } from "vitest";

const finds = vi.hoisted(() => vi.fn());
const records = vi.hoisted(() => vi.fn());
const vocabReads = vi.hoisted(() => vi.fn());
const storedVocab = vi.hoisted(() => vi.fn());

vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (importOriginal) => ({ ...(await importOriginal<object>()), findByAttribute: finds }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => ({ ...(await importOriginal<object>()), readRecord: records }));
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ attributeSpelling: async (n: string) => n }));
vi.mock("@kaigilb/gilbplatformcode-plan-stakeholder-io", () => ({ masterKindReader: () => ({ kinds: "reader" }) }));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-vocabulary", () => ({
  cardMasterSource: () => ({ source: "master" }),
  readStoredCardVocabulary: storedVocab,
  readStakeholderCardVocabulary: vocabReads,
}));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-model", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  personKindNamesOf: (v: { persons?: string[] } | null | undefined) => v?.persons ?? null,
}));

import { __resetPersonKinds, readOrgEmployeesPage } from "./orgEmployees";
import { fakeHost, memoryResources } from "../test/fakeHost";

const VAULT = "https://v.example.test/base";
const ORG = `${VAULT}/e/org1`;
const e = (id: string) => `${VAULT}/e/${id}`;

const docs = {
  [e("m1")]: { employer: { "@id": ORG }, employee: { "@id": e("ann") }, jobTitle: "CEO" },
  [e("m2")]: { "a:employer": { "@id": ORG }, "a:employee": { "@id": e("ben") }, "a:jobTitle": ["CTO", "Founder"] },
};

let host: ReturnType<typeof setup>;
function setup() {
  const resourceLog: string[][] = [];
  const photoKeys = vi.fn(async () => ["profilePhoto"] as readonly string[]);
  const vocab = vi.fn(async () => ({ employer: "a:employer", employee: "a:employee" }));
  const readResources = vi.fn(memoryResources(docs, resourceLog));
  return { h: fakeHost({ readResources, photoReadKeys: photoKeys, resolveEmploymentLinkVocab: vocab }), readResources, photoKeys, vocab, resourceLog };
}

beforeEach(() => {
  __resetPersonKinds();
  finds.mockReset();
  records.mockReset();
  vocabReads.mockReset();
  storedVocab.mockReset();
  storedVocab.mockReturnValue(undefined);
  vocabReads.mockResolvedValue({ persons: ["Person"] });
  finds.mockImplementation(async (attr: string, value: { "@id": string }) => {
    if (attr === "a:employer") return value["@id"] === ORG ? { count: 2, ids: [e("m1"), e("m2")] } : { count: 0, ids: [] };
    return { count: 0, ids: [] };
  });
  records.mockImplementation(async (id: string) => ({ typeUri: "https://o.example.test/base/t/Person", facts: { name: id === "ann" ? "Ann" : "Ben", ...(id === "ann" ? { profilePhoto: "/files/ann1" } : {}) } }));
  host = setup();
});

describe("the default reads go through the host's three data members", () => {
  it("reads the employments with the host, once per page, with the addresses found and the vault", async () => {
    const page = await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(host.readResources).toHaveBeenCalledTimes(1);
    expect(host.readResources).toHaveBeenCalledWith([e("m1"), e("m2")], VAULT);
    expect(page.employees.map((p) => [p.name, p.titles])).toEqual([["Ann", ["CEO"]], ["Ben", ["CTO", "Founder"]]]);
  });
  it("asks the host for the photo spellings ONCE per page, and takes the picture of a person from them", async () => {
    const page = await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(host.photoKeys).toHaveBeenCalledTimes(1);
    expect(page.employees.map((p) => p.photoRef)).toEqual(["/files/ann1", null]);
  });
  it("asks the host for the employment link spellings twice (employer and employee), and reads the employment under them", async () => {
    await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(host.vocab).toHaveBeenCalledTimes(2);
    expect(finds.mock.calls.map((c) => c[0])).toContain("a:employer");
  });
  it("a host that cannot name the employment link fails the page (not an empty list)", async () => {
    const bad = setup();
    bad.vocab.mockRejectedValue(new Error("the master did not answer"));
    await expect(readOrgEmployeesPage(bad.h, ORG, VAULT)).rejects.toThrow("the master did not answer");
  });
  it("a host whose photo spellings fail still lists the people, without pictures", async () => {
    host.photoKeys.mockRejectedValue(new Error("no term"));
    const page = await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(page.employees.map((p) => p.photoRef)).toEqual([null, null]);
  });
  it("does not call `this`-bound members wrongly: the members are called as methods of the host", async () => {
    const seen: unknown[] = [];
    const h = fakeHost({
      readResources(this: unknown, uris, v) {
        seen.push(this);
        return memoryResources(docs)(uris, v);
      },
    });
    Object.assign(h, { photoReadKeys: async () => ["profilePhoto"], resolveEmploymentLinkVocab: async () => ({ employer: "a:employer", employee: "a:employee" }) });
    await readOrgEmployeesPage(h, ORG, VAULT);
    expect(seen).toEqual([h]);
  });
  it("finds are asked at the vault's own origin", async () => {
    await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(new Set(finds.mock.calls.map((c) => c[3]))).toEqual(new Set(["https://v.example.test"]));
  });
});

describe("the person kinds are read once for the session (module state)", () => {
  const memberFind = () =>
    finds.mockImplementation(async (attr: string) => (attr === "a:memberOf" ? { count: 1, ids: [e("ann")] } : { count: 0, ids: [] }));
  it("reads the card vocabulary once across pages, and again after __resetPersonKinds", async () => {
    memberFind();
    await readOrgEmployeesPage(host.h, ORG, VAULT);
    await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(vocabReads).toHaveBeenCalledTimes(1);
    __resetPersonKinds();
    await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(vocabReads).toHaveBeenCalledTimes(2);
  });
  it("lists a member whose kind is a person kind", async () => {
    memberFind();
    const page = await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(page.employees.map((p) => p.name)).toEqual(["Ann"]);
  });
  it("takes the kinds from the vocabulary kept on the device first, and reads the master only when there is none", async () => {
    memberFind();
    storedVocab.mockReturnValue({ persons: ["Person"] });
    await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(vocabReads).not.toHaveBeenCalled();
  });
  it("a failed read is not kept: the next page asks again, and the member is counted as left out meanwhile", async () => {
    memberFind();
    vocabReads.mockRejectedValueOnce(new Error("down"));
    const first = await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(first.employees).toEqual([]);
    expect(first.notListed).toBe(1);
    const second = await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(vocabReads).toHaveBeenCalledTimes(2);
    expect(second.employees.map((p) => p.name)).toEqual(["Ann"]);
  });
  it("a member of another kind is neither listed nor left out", async () => {
    memberFind();
    records.mockResolvedValue({ typeUri: "https://o.example.test/base/t/Task", facts: { name: "A task" } });
    const page = await readOrgEmployeesPage(host.h, ORG, VAULT);
    expect(page.employees).toEqual([]);
    expect(page.notListed).toBe(0);
  });
});
