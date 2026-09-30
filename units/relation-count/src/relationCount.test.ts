import { describe, expect, it } from "vitest";
import type { RecordRelation } from "./relationCount";
import {
  DEFAULT_RELATION_COUNT_FILTER,
  GRAPH_NODE_CAP,
  RELATION_COUNT_URL_PARAM,
  bfsDistancesFrom,
  buildRecordAdjacency,
  capVisibleRecordIds,
  coMemberRecordIds,
  countDistinctRelationUris,
  countDistinctRelationsForRecord,
  hopDepthForFilter,
  parseRelationCountFilter,
  relationCountsByRecord,
  serializeRelationCountFilter,
  visibleRecordIdsForRelationCountFilter,
} from "./relationCount";

const rel = (
  relation: string,
  role = "member",
  members?: RecordRelation["members"],
): RecordRelation => ({
  relation,
  role,
  ...(members ? { members } : {}),
});
const R = (id: string) => `https://example.test/base/r/${id}`;

function reports(entries: Array<[string, RecordRelation[]]>): Map<string, RecordRelation[]> {
  return new Map(entries);
}

function chainFixture() {
  const map = reports([
    ["A", [rel(R("ab"))]],
    ["B", [rel(R("ab")), rel(R("bc"))]],
    ["C", [rel(R("bc")), rel(R("cd"))]],
    ["D", [rel(R("cd")), rel(R("de"))]],
    ["E", [rel(R("de"))]],
    ["Z", []],
    ["S", [rel(R("solo"))]],
  ]);
  const all = ["A", "B", "C", "D", "E", "Z", "S"];
  return { map, all };
}

describe("hop helpers", () => {
  it("maps 1, 2, 3 and leaves all as null", () => {
    expect(hopDepthForFilter("1")).toBe(1);
    expect(hopDepthForFilter("2")).toBe(2);
    expect(hopDepthForFilter("3")).toBe(3);
    expect(hopDepthForFilter("all")).toBeNull();
  });

  it("counts distinct relation URIs and ignores an empty URI", () => {
    expect(countDistinctRelationUris([])).toBe(0);
    expect(countDistinctRelationUris([rel(R("a")), rel(R("b")), rel(R("a"))])).toBe(2);
    expect(countDistinctRelationUris([rel(""), rel(R("x"))])).toBe(1);
  });

  it("returns null when the record is not in the map, and 0 for a resolved empty list", () => {
    const map = reports([["a", [rel(R("x"))]]]);
    expect(countDistinctRelationsForRecord("a", map)).toBe(1);
    expect(countDistinctRelationsForRecord("b", map)).toBe(null);
    expect(countDistinctRelationsForRecord("c", reports([["c", []]]))).toBe(0);
  });

  it("maps every requested id", () => {
    const map = reports([
      ["a", [rel(R("x")), rel(R("y"))]],
      ["b", []],
    ]);
    const counts = relationCountsByRecord(["a", "b", "c"], map);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(0);
    expect(counts.get("c")).toBe(null);
  });
});

describe("co-membership", () => {
  const { map, all } = chainFixture();

  it("keeps partners that share a URI and drops the isolate and the solo relation", () => {
    expect(coMemberRecordIds("A", map, new Set(all)).sort()).toEqual(["B"]);
    expect(coMemberRecordIds("B", map, new Set(all)).sort()).toEqual(["A", "C"]);
    expect(coMemberRecordIds("C", map, new Set(all)).sort()).toEqual(["B", "D"]);
    expect(coMemberRecordIds("S", map, new Set(all))).toEqual([]);
    expect(coMemberRecordIds("Z", map, new Set(all))).toEqual([]);
  });

  it("trusts a member named on this side even when the other side does not report it", () => {
    const oneWay = reports([
      [
        "A",
        [
          rel(R("ab"), "member", [
            { member: "https://example.test/base/e/B?x=1", role: "member" },
          ]),
        ],
      ],
      ["B", []],
    ]);
    const ids = new Set(["A", "B"]);
    expect(coMemberRecordIds("A", oneWay, ids)).toEqual(["B"]);
    expect(coMemberRecordIds("B", oneWay, ids)).toEqual([]);
    const adj = buildRecordAdjacency(["A", "B"], oneWay);
    expect(adj.get("A")).toEqual(["B"]);
    expect(adj.get("B")).toEqual([]);
    expect(bfsDistancesFrom("A", adj).get("B")).toBe(1);
    expect(bfsDistancesFrom("B", adj).has("A")).toBe(false);
  });

  it("decodes the member id and drops a partner outside the set", () => {
    const map = reports([
      [
        "A",
        [
          rel(R("ab"), "member", [
            { member: "https://example.test/base/e/B%2F1", role: "member" },
            { member: "https://example.test/base/e/Out", role: "member" },
          ]),
        ],
      ],
    ]);
    expect(coMemberRecordIds("A", map, new Set(["A", "B/1"]))).toEqual(["B/1"]);
  });

  it("walks the chain by hop", () => {
    const adj = buildRecordAdjacency(all, map);
    expect(adj.get("A")?.slice().sort()).toEqual(["B"]);
    expect(adj.get("E")?.slice().sort()).toEqual(["D"]);
    expect(adj.get("Z")).toEqual([]);
    const fromA = bfsDistancesFrom("A", adj);
    expect(fromA.get("A")).toBe(0);
    expect(fromA.get("C")).toBe(2);
    expect(fromA.get("E")).toBe(4);
    expect(fromA.has("Z")).toBe(false);
  });

  it("an origin missing from the adjacency map is distance 0 alone", () => {
    const dist = bfsDistancesFrom("missing", new Map());
    expect(dist.get("missing")).toBe(0);
    expect(dist.size).toBe(1);
  });
});

describe("url", () => {
  it("keeps the query key grc", () => {
    expect(RELATION_COUNT_URL_PARAM).toBe("grc");
  });

  it("accepts only the four exact strings and defaults the rest to hop 2", () => {
    expect(parseRelationCountFilter("1")).toBe("1");
    expect(parseRelationCountFilter("2")).toBe("2");
    expect(parseRelationCountFilter("3")).toBe("3");
    expect(parseRelationCountFilter("all")).toBe("all");
    expect(parseRelationCountFilter(null)).toBe(DEFAULT_RELATION_COUNT_FILTER);
    expect(parseRelationCountFilter(undefined)).toBe("2");
    expect(parseRelationCountFilter("")).toBe("2");
    expect(parseRelationCountFilter("4")).toBe("2");
    expect(parseRelationCountFilter(">=2")).toBe("2");
    expect(parseRelationCountFilter("All")).toBe("2");
    expect(parseRelationCountFilter(" 1")).toBe("2");
  });

  it("omits the default and round-trips the others", () => {
    expect(serializeRelationCountFilter("2")).toBeNull();
    expect(serializeRelationCountFilter("1")).toBe("1");
    expect(serializeRelationCountFilter("3")).toBe("3");
    expect(serializeRelationCountFilter("all")).toBe("all");
    for (const v of ["1", "2", "3", "all"] as const) {
      expect(parseRelationCountFilter(serializeRelationCountFilter(v))).toBe(v);
    }
  });
});

describe("cap", () => {
  it("moves the selection to the front and stops at the cap", () => {
    const ids = Array.from({ length: 150 }, (_, i) => `r${i}`);
    const capped = capVisibleRecordIds(ids, "r140", GRAPH_NODE_CAP);
    expect(capped).toHaveLength(GRAPH_NODE_CAP);
    expect(capped[0]).toBe("r140");
    expect(capped).toContain("r0");
    expect(capped).not.toContain("r149");
  });

  it("does not invent a selection that is not in the list", () => {
    expect(capVisibleRecordIds(["a", "b"], "missing", 1)).toEqual(["a"]);
  });

  it("returns a copy when the list is already short", () => {
    const ids = ["a"];
    const capped = capVisibleRecordIds(ids, null, 10);
    expect(capped).toEqual(["a"]);
    expect(capped).not.toBe(ids);
  });

  it("a max of 0 still keeps the first id, because the check is after the push", () => {
    expect(capVisibleRecordIds(["a", "b"], null, 0)).toEqual(["a"]);
  });
});

describe("visible ids", () => {
  const { map, all } = chainFixture();

  it("hop 1, 2, and 3 from A", () => {
    const base = {
      candidateIds: all,
      allRecordIds: all,
      relationsByRecord: map,
      countsAvailable: true,
      selectedRecordId: "A" as string | null,
    };
    expect(visibleRecordIdsForRelationCountFilter({ ...base, filter: "1" })).toEqual(["A", "B"]);
    expect(visibleRecordIdsForRelationCountFilter({ ...base, filter: "2" })).toEqual(["A", "B", "C"]);
    expect(visibleRecordIdsForRelationCountFilter({ ...base, filter: "3" })).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("all, no selection, and unavailable counts return the candidates unsorted", () => {
    const candidates = ["C", "A", "Z"];
    expect(
      visibleRecordIdsForRelationCountFilter({
        candidateIds: candidates,
        allRecordIds: all,
        relationsByRecord: map,
        filter: "all",
        countsAvailable: true,
        selectedRecordId: "A",
      }),
    ).toEqual(["C", "A", "Z"]);
    expect(
      visibleRecordIdsForRelationCountFilter({
        candidateIds: candidates,
        allRecordIds: all,
        relationsByRecord: map,
        filter: "1",
        countsAvailable: true,
        selectedRecordId: null,
      }),
    ).toEqual(["C", "A", "Z"]);
    expect(
      visibleRecordIdsForRelationCountFilter({
        candidateIds: candidates,
        allRecordIds: all,
        relationsByRecord: map,
        filter: "1",
        countsAvailable: false,
        selectedRecordId: "A",
      }),
    ).toEqual(["C", "A", "Z"]);
  });

  it("sorts when the selection is not a candidate, and does not force it in", () => {
    expect(
      visibleRecordIdsForRelationCountFilter({
        candidateIds: ["Z", "A"],
        allRecordIds: all,
        relationsByRecord: map,
        filter: "1",
        countsAvailable: true,
        selectedRecordId: "B",
      }),
    ).toEqual(["A", "Z"]);
  });

  it("keeps a text bridge out of the result and still uses it for distance", () => {
    expect(
      visibleRecordIdsForRelationCountFilter({
        candidateIds: ["A", "C"],
        allRecordIds: all,
        relationsByRecord: map,
        filter: "1",
        countsAvailable: true,
        selectedRecordId: "A",
      }),
    ).toEqual(["A"]);
    expect(
      visibleRecordIdsForRelationCountFilter({
        candidateIds: ["A", "C"],
        allRecordIds: all,
        relationsByRecord: map,
        filter: "2",
        countsAvailable: true,
        selectedRecordId: "A",
      }),
    ).toEqual(["A", "C"]);
  });

  it("sorts the hop result even when the candidate order differs", () => {
    expect(
      visibleRecordIdsForRelationCountFilter({
        candidateIds: ["D", "B", "C"],
        allRecordIds: all,
        relationsByRecord: map,
        filter: "1",
        countsAvailable: true,
        selectedRecordId: "C",
      }),
    ).toEqual(["B", "C", "D"]);
  });

  it("three records on one URI are all one hop", () => {
    const multi = reports([
      ["p1", [rel(R("tri"))]],
      ["p2", [rel(R("tri"))]],
      ["p3", [rel(R("tri"))]],
      ["out", [rel(R("other"))]],
    ]);
    const ids = ["p1", "p2", "p3", "out"];
    expect(
      visibleRecordIdsForRelationCountFilter({
        candidateIds: ids,
        allRecordIds: ids,
        relationsByRecord: multi,
        filter: "1",
        countsAvailable: true,
        selectedRecordId: "p1",
      }),
    ).toEqual(["p1", "p2", "p3"]);
  });

  it("an isolate and a solo relation show only themselves", () => {
    for (const id of ["Z", "S"] as const) {
      expect(
        visibleRecordIdsForRelationCountFilter({
          candidateIds: all,
          allRecordIds: all,
          relationsByRecord: map,
          filter: "1",
          countsAvailable: true,
          selectedRecordId: id,
        }),
      ).toEqual([id]);
    }
  });
});
