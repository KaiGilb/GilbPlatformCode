import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { STAKEHOLDER_SEARCH_AUTHORITY_KEY, planFindVaultKey, planSearchKey } from "./cacheKeys";
import { invalidatePlanSearch } from "./planSearch";
import { patchPlanFindRows, planFindKey } from "./planFind";
import { baseRow } from "../test/rows";

describe("the shared key prefixes", () => {
  it("each is the literal the app wrote at its sites", () => {
    expect(STAKEHOLDER_SEARCH_AUTHORITY_KEY).toEqual(["stakeholder-search", "authority"]);
    expect(planSearchKey("v")).toEqual(["plan-search", "v"]);
    expect(planFindVaultKey("v")).toEqual(["plan-find", "v"]);
  });
  it("the plan-find entry key (four parts) sits under planFindVaultKey, as a prefix match", () => {
    const qc = new QueryClient();
    qc.setQueryData(planFindKey("v", "a:partOf", "r"), { rows: [baseRow("a", { n: "1" })], total: 1, capped: false, unread: 0 });
    expect(qc.getQueryCache().findAll({ queryKey: planFindVaultKey("v") })).toHaveLength(1);
    expect(qc.getQueryCache().findAll({ queryKey: planFindVaultKey("w") })).toHaveLength(0);
    patchPlanFindRows(qc, "v", "a", (r) => ({ ...r, facts: { n: "2" } }));
    expect((qc.getQueryData(planFindKey("v", "a:partOf", "r")) as { rows: { facts: { n: string } }[] }).rows[0]!.facts.n).toBe("2");
  });
  it("invalidatePlanSearch marks the entries under planSearchKey of that vault and no other", () => {
    const qc = new QueryClient();
    qc.setQueryData([...planSearchKey("v"), "Value", "Reach"], 1);
    qc.setQueryData([...planSearchKey("w"), "Value", "Reach"], 1);
    qc.setQueryData(["stakeholder-search", "authority", "x"], 1);
    invalidatePlanSearch(qc, "v");
    expect(qc.getQueryState([...planSearchKey("v"), "Value", "Reach"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState([...planSearchKey("w"), "Value", "Reach"])?.isInvalidated).toBe(false);
    void qc.invalidateQueries({ queryKey: STAKEHOLDER_SEARCH_AUTHORITY_KEY });
    expect(qc.getQueryState(["stakeholder-search", "authority", "x"])?.isInvalidated).toBe(true);
  });
});
