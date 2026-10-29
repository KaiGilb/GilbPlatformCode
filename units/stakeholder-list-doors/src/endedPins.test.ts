// New. A kept record is taken as ended on a 404 only if this reader's pages did not list it (a page lists only live records). A record this session saw joined, listed by the asking reader's own page,
// that then answers 404 stays; the same record unlisted by that reader is taken as ended.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import { fakeDoorsHost, installPlatformHooks, resp } from "../test/support";

installPlatformHooks();
const doorsHost = fakeDoorsHost();

const OWN = "https://ann.example.test/vault";
const ANN = `${OWN}/i`;
const MEMBER = "https://k.example.test/vault";
const REC = "https://ann.example.test/base/e/r1";
const DOC = { "@id": REC, "@type": "t:Person", name: "Kari", sameAs: { "@id": MEMBER } };

let resolveAnswers: Array<"person" | "none">;
beforeEach(() => {
  forgetLinkedRecords();
  resolveAnswers = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/records")) return resp(200, { total: 1, complete: true, pageSize: 20, offset: 0, nextOffset: null, records: [{ entity: REC, typeUri: "t:Person", updatedAt: "2026-10-19T10:00:00Z", label: "Kari", vault: OWN, vaultAmbiguous: false, body: DOC }] });
    if (url.pathname.endsWith("/base/find-by-attribute")) return resp(200, { count: 1, ids: [REC] });
    if (url.pathname.includes("online-card-anchor")) {
      return resolveAnswers.shift() === "person" ? resp(200, { kind: "person", principal: MEMBER, entity: `${MEMBER}/e/card`, vaultRepresents: "t/Person" }) : resp(404, { error: "no_online_card" });
    }
    return url.pathname.endsWith("/lws/r/r1") ? resp(200, DOC) : resp(404, {});
  });
});
afterEach(() => vi.unstubAllGlobals());

const depsOf = () => stakeholderListDeps(doorsHost, { qc: new QueryClient(), holder: ANN, vaults: [OWN], ownVaultId: OWN, typeNames: ["Person"], ownCardIds: [] });
const kept = async () => (await depsOf().linkedRecordsOf!([MEMBER], 40)).map((f) => f.record.recordId);

describe("a 404 takes a kept record as ended only if the asking reader did not list it", () => {
  it("a record seen joined and unlisted by the asking reader is taken as ended", async () => {
    const first = depsOf();
    expect((await first.linkedRecordsOf!([MEMBER], 40)).length).toBe(1);
    resolveAnswers = ["person", "none"];
    expect((await first.resolve(REC)).kind).toBe("person");
    const second = depsOf();
    expect((await second.resolve(REC)).kind).toBe("none");
    expect(await kept()).toEqual([]);
  });
  it("the same record, listed by the asking reader's own page, is not taken as ended", async () => {
    const first = depsOf();
    await first.linkedRecordsOf!([MEMBER], 40);
    resolveAnswers = ["person", "none"];
    await first.resolve(REC);
    const second = depsOf();
    await second.listRecords(OWN, 0, 20);
    expect((await second.resolve(REC)).kind).toBe("none");
    expect(await kept()).toEqual([REC]);
  });
});
