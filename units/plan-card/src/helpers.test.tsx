// What the unit exports, the two functions the card shares (draftFrom, pickLive), the private copies, the missing-host error, and the
// person search.
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CONSTRAINT_AVOID } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import * as unit from "./index";
import { ConstraintCreateAuthority, PersonAuthoritySearch, PlanFunctionForm, PlanForm, PlanCardHostContext, draftFrom, pickLive } from "./index";
import { PLAN_FIND_CAP, PLAN_FIND_CAP_PART_OF, planFindCapFor, planFindRows } from "./planFind";
import { planVaultOf, vaultIdOfEntity } from "./planVault";
import { writeSource } from "./writeSource";
import { BRIDGE_SLUGS, entityDisplayName } from "./entityDisplayName";
import { ANN, VAULT, makeApp } from "../test/app";
import { rowOf } from "../test/app";
import { entityUriOf } from "../test/server";

describe("what the unit exports", () => {
  test("the card, its alias, the two functions, the person search and the host context, and nothing else at run time", () => {
    expect(Object.keys(unit).sort()).toEqual(["ConstraintCreateAuthority", "PersonAuthoritySearch", "PlanCardHostContext", "PlanForm", "PlanFunctionForm", "draftFrom", "pickLive"]);
    expect(PlanForm).toBe(PlanFunctionForm);
    expect(PlanCardHostContext).toBe(unit.PlanCardHostContext);
  });

  test("the host context has no host by default", () => {
    expect((PlanCardHostContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });
});

describe("a card with no host above it", () => {
  test("throws an error that names the context", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = makeApp();
    const row = app.seed("fn1", "t:Function", { unitTag: "A.B" });
    expect(() =>
      render(
        <app.Frame withHost={false}>
          <PlanFunctionForm record={row} vaultId="v" canEdit onOpen={() => {}} onNotice={() => {}} />
        </app.Frame>,
      ),
    ).toThrow("plan-card: wrap the app in <PlanCardHostContext.Provider value={host}>");
    quiet.mockRestore();
  });

  test("so does the person search", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PersonAuthoritySearch vaultId="v" onPick={() => {}} />)).toThrow(/PlanCardHostContext/);
    quiet.mockRestore();
  });
});

function row(etag: string, updatedAt: number): GridRecord {
  return {
    id: "fn1",
    entityUri: entityUriOf("fn1"),
    typeUri: "t:Function",
    facts: { unitTag: "Walk" },
    opaqueFacts: [],
    etag,
    updatedAt,
    servedKeys: ["unitTag"],
    served: { facts: { unitTag: "Walk" }, context: undefined, etag },
  };
}

describe("pickLive", () => {
  test("uses the list when it is newer, the save when the list is older or missing, and the record when nothing was saved", () => {
    const record = row("e1", 1);
    const saved = row("e2", 10);
    const newer = row("e9", 20);
    const older = row("e0", 5);
    expect(pickLive(newer, saved, record)).toBe(newer);
    expect(pickLive(older, saved, record)).toBe(saved);
    expect(pickLive(undefined, saved, record)).toBe(saved);
    const fallback = pickLive(undefined, null, record);
    expect(fallback.id).toBe(record.id);
    expect(fallback.etag).toBe("e1");
  });

  test("the list wins when nothing was saved, or when it has the saved version, whatever its time", () => {
    const record = row("e1", 1);
    const list = row("e5", 2);
    expect(pickLive(list, null, record)).toBe(list);
    const saved = row("e5", 99);
    expect(pickLive(list, saved, record)).toBe(list);
  });

  test("a list row with no time is older than a save with one; a save with no time loses to a list with one", () => {
    const record = row("e1", 1);
    const noTime = { ...row("e3", 0), updatedAt: undefined } as unknown as GridRecord;
    expect(pickLive(noTime, row("e2", 10), record).etag).toBe("e2");
    const saved = { ...row("e2", 0), updatedAt: undefined } as unknown as GridRecord;
    expect(pickLive(row("e3", 1), saved, record).etag).toBe("e3");
  });

  test("with neither, it is a copy of the record; it is stamped with the time now only when the record has no time of its own", () => {
    const record = row("e1", 1);
    const live = pickLive(undefined, null, record);
    expect(live).not.toBe(record);
    expect(live.etag).toBe("e1");
    expect(live.updatedAt).toBe(1);
    const before = Date.now();
    const bare = pickLive(undefined, null, { ...record, updatedAt: undefined } as unknown as GridRecord);
    expect(bare.updatedAt).toBeUndefined();
    const noKey = { ...record } as Record<string, unknown>;
    delete noKey.updatedAt;
    expect(pickLive(undefined, null, noKey as unknown as GridRecord).updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe("draftFrom", () => {
  const record = (served: Record<string, unknown>, type = "t:Function") => rowOf("fn1", type, served) as BaseRecord;

  test("reads the type, the level, the meters and the status lines of a record", () => {
    const d = draftFrom(
      record({
        ontologyTerm: "https://ontology.example.test/base/t/Door",
        level: "Product",
        hasMeter: [{ "a:meterAgentKind": "ai", "a:method": "scan" }],
        levelStatements: [{ "a:status": "Planned", "a:statusWhen": "2026-10-01" }, { "a:status": "Developed", "a:statusWhen": "2026-10-10" }],
        concept: { "a:label": "Gate", "@id": "https://ontology.example.test/base/t/Gate" },
      }),
    );
    expect(d.ontologyTerm).toBe("https://ontology.example.test/base/t/Door");
    expect(d.level).toBe("Product");
    expect(d.meters.ai.method).toBe("scan");
    expect(d.meters.human.method).toBe("");
    expect(d.lines.map((l) => [l.status, l.when])).toEqual([["Developed", "2026-10-10"], ["Planned", "2026-10-01"]]);
    expect(d.concept).toEqual({ label: "Gate", id: "https://ontology.example.test/base/t/Gate" });
  });

  test("a record with nothing in it gives an empty draft", () => {
    const d = draftFrom(record({}));
    expect([d.ontologyTerm, d.level, d.lines.length, d.concept.label, d.concept.id]).toEqual(["", "", 0, "", ""]);
  });

  test("a text fact is read from the served value, else from the text of the fact", () => {
    const r = rowOf("fn1", "t:Function", {});
    expect(draftFrom({ ...r, facts: { level: "Solution" } } as BaseRecord).level).toBe("Solution");
  });

  test("the Value's Scale is the Scale record among its parts, else an older one on the Value; the level lists come from the records, so a draft has none", () => {
    const value = record({ hasScale: { "@id": entityUriOf("scale1") } }, "t:Value");
    const parts = [rowOf("scale1", "t:Scale", { unit: "min", partOf: { "@id": entityUriOf("fn1") } })] as BaseRecord[];
    expect(draftFrom(value, parts).value.scale.unit).toBe("min");
    expect(draftFrom(value).value.scale.unit).toBe("");
    expect(draftFrom(value, parts).value.levels).toEqual([]);
  });
});

describe("the private copies", () => {
  test("planFind: a Value's part find pages to 2000, any other to 300; no data has no rows", () => {
    expect(PLAN_FIND_CAP).toBe(300);
    expect(PLAN_FIND_CAP_PART_OF).toBe(2000);
    expect(planFindCapFor(true)).toBe(2000);
    expect(planFindCapFor(false)).toBe(300);
    expect(planFindRows(undefined)).toEqual([]);
    const rows = [rowOf("a", "t:Function", {})];
    expect(planFindRows({ rows, total: 1, capped: false, unread: 0 })).toBe(rows);
  });

  test("planVaultOf: the vault the entity address names (up to /e/), else the screen vault", () => {
    expect(vaultIdOfEntity("https://h.example.test/base/e/x")).toBe("https://h.example.test/base");
    expect(vaultIdOfEntity("x")).toBeNull();
    expect(planVaultOf({ entityUri: "https://h.example.test/base/e/x" }, "https://p.example.test/vault")).toBe("https://h.example.test/base");
    expect(planVaultOf({}, "https://p.example.test/vault")).toBe("https://p.example.test/vault");
    expect(planVaultOf({ entityUri: null }, "s")).toBe("s");
  });

  test("writeSource: nothing when the record carries no served keys, else the address and the keys", () => {
    expect(writeSource({})).toEqual([]);
    expect(writeSource({ servedKeys: [] })).toEqual([]);
    expect(writeSource({ entityUri: "u", servedKeys: ["a"] })).toEqual([{ at: "u", servedKeys: ["a"] }]);
    expect(writeSource({ servedKeys: ["a"] })).toEqual([{ at: null, servedKeys: ["a"] }]);
  });

  test("entityDisplayName is the app's: the record's own name before its label", () => {
    expect(BRIDGE_SLUGS).toEqual(["title", "processName", "name"]);
    expect(entityDisplayName({ name: "N", label: "L" })).toBe("N");
    expect(entityDisplayName({ label: "L", unitTag: "U" })).toBe("L");
    expect(entityDisplayName({}, { entityUri: "https://h.example.test/base/e/ann", fallback: "x" })).toBe("ann");
    expect(entityDisplayName(undefined, { fallback: "x" })).toBe("x");
  });
});

describe("PersonAuthoritySearch", () => {
  test("searches the vaults the person holds for the person kinds, and hands up the hit that is picked", async () => {
    const app = makeApp();
    const picked: unknown[] = [];
    render(
      <app.Frame>
        <PersonAuthoritySearch vaultId="v" onPick={(h) => picked.push(h)} testId="who" />
      </app.Frame>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Authority" }), "ann");
    await user.click(await screen.findByText("Ann Co"));
    expect(picked).toEqual([{ uri: ANN, label: "Ann Co", typeName: "Person" }]);
    const call = app.host.findStakeholderRecords.mock.calls.find((c) => c[2] === "ann")!;
    expect(call[0]).toEqual([VAULT]);
    expect(call[1]).toContain("Person");
    expect(screen.getByTestId("who")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ New stakeholder" })).toBeNull();
  });

  test("offers + New stakeholder only when the caller gives onNew", async () => {
    const app = makeApp();
    let made = 0;
    render(
      <app.Frame>
        <PersonAuthoritySearch vaultId="v" onPick={() => {}} onNew={() => made++} />
      </app.Frame>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "+ New stakeholder" }));
    expect(made).toBe(1);
  });

  test("says when the search could not be made, and never that there is none", async () => {
    const app = makeApp();
    app.host.findStakeholderRecords.mockRejectedValue(new Error("down"));
    render(
      <app.Frame>
        <PersonAuthoritySearch vaultId="v" onPick={() => {}} />
      </app.Frame>,
    );
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Authority" }), "ann");
    await waitFor(() => expect(screen.getByText("Could not search people. That is not a statement that there are none.")).toBeTruthy());
  });
});

describe("ConstraintCreateAuthority", () => {
  test("shows what to avoid and a required Authority; a picked person has a Remove", async () => {
    const app = makeApp();
    const picks: unknown[] = [];
    const hit = { uri: ANN, label: "Ann Co", typeName: "Person" };
    render(
      <app.Frame>
        <ConstraintCreateAuthority vaultId="v" picked={hit} onPick={(h) => picks.push(h)} onNew={() => {}} />
      </app.Frame>,
    );
    const box = screen.getByTestId("plan-constraint-create-authority");
    expect(box.textContent).toContain(CONSTRAINT_AVOID);
    expect(box.textContent).toContain("required");
    expect(box.textContent).toContain("Ann Co");
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove Ann Co" }));
    expect(picks).toEqual([null]);
  });

  test("with no one picked it is the search, with + New stakeholder", () => {
    const app = makeApp();
    render(
      <app.Frame>
        <ConstraintCreateAuthority vaultId="v" picked={null} onPick={() => {}} onNew={() => {}} />
      </app.Frame>,
    );
    expect(screen.getByRole("textbox", { name: "Authority" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ New stakeholder" })).toBeTruthy();
  });
});
