import { describe, expect, it } from "vitest";
import { groupHistoryDatoms, type HistoryDatom } from "./historyEvents";

describe("groupHistoryDatoms", () => {
  it("orders saves by the string, names the actor, and labels the English masters", () => {
    const events = groupHistoryDatoms([
      {
        txn_id: "old",
        tx_from: "2020-01-01",
        attribute: "a:label",
        value: "A",
        agent: "http://example.test/base/p/abc",
      },
      { txn_id: "new", tx_from: "2020-01-02", attribute: "a:does", value: "B", op: 0 },
    ]);
    expect(events.map((event) => event.txnId)).toEqual(["new", "old"]);
    expect(events[0]?.changes[0]).toMatchObject({
      op: "retract",
      attributeLabel: "description (en master)",
      summary: "B",
    });
    expect(events[1]?.who).toBe("Person");
    expect(events[1]?.agentLabel).toBe("Person");
    expect(events[0]?.who).toBe("Unknown actor");
  });

  it("picks the last timestamp with string order, not a date parse", () => {
    const events = groupHistoryDatoms([
      { txn_id: "t", tx_from: "2020-12", attribute: "x", value: "a" },
      { txn_id: "t", tx_from: "2020-2", attribute: "y", value: "b" },
      { txn_id: "bare", valid_from: "2019-01-01", attribute: "z", value: "c" },
      { txn_id: "empty", attribute: "q", value: "d" },
    ]);
    expect(events.find((event) => event.txnId === "t")?.at).toBe("2020-2");
    expect(events.map((event) => event.txnId)).toEqual(["t", "bare", "empty"]);
  });

  it("drops a language map when any priority attribute is in the same save", () => {
    const events = groupHistoryDatoms([
      { txn_id: "t", attribute: "a:label", value: "Name" },
      {
        txn_id: "t",
        attribute: "a:labelByLang",
        op_label: "assert",
        value: { no: "Navn" },
      },
      { txn_id: "t", attribute: "not-priority", value: "gone" },
    ]);
    expect(events[0]?.changes).toEqual([
      { op: "assert", attribute: "a:label", attributeLabel: "name (en master)", summary: "Name" },
    ]);
  });

  it("expands a language map when nothing in the save is priority", () => {
    const events = groupHistoryDatoms([
      {
        txn_id: "t",
        attribute: "a:labelByLang",
        op_label: "retract",
        value: { no: "old", en: "same", skip: 1 },
      },
      {
        txn_id: "t",
        attribute: "a:labelByLang",
        op_label: "assert",
        value: { no: "new", en: "same", sv: "" },
      },
    ]);
    expect(events[0]?.changes).toEqual([
      {
        op: "change",
        attribute: "a:labelByLang",
        attributeLabel: "name (no)",
        summary: "old  →  new",
      },
      {
        op: "assert",
        attribute: "a:labelByLang",
        attributeLabel: "name (sv)",
        summary: "",
      },
    ]);
  });

  it("keeps only the first eight rows when none are priority", () => {
    const rows: HistoryDatom[] = [];
    for (let i = 0; i < 9; i += 1) {
      rows.push({ txn_id: "t", attribute: `n${i}`, value: String(i) });
    }
    const events = groupHistoryDatoms(rows);
    expect(events[0]?.changes.map((change) => change.attribute)).toEqual([
      "n0",
      "n1",
      "n2",
      "n3",
      "n4",
      "n5",
      "n6",
      "n7",
    ]);
  });

  it("groups a missing transaction id by fact id, and does not group rows with neither", () => {
    const grouped = groupHistoryDatoms([
      { fact_id: "f1", attribute: "x", value: "a" },
      { fact_id: "f1", attribute: "y", value: "b" },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.txnId).toBe("orphan-f1");
    expect(grouped[0]?.changes).toHaveLength(2);

    const separate = groupHistoryDatoms([
      { txn_id: "", attribute: "x", value: "a" },
      { attribute: "y", value: "b" },
    ]);
    expect(separate).toHaveLength(2);
    expect(separate[0]?.txnId.startsWith("orphan-")).toBe(true);
    expect(separate[0]?.txnId).not.toBe(separate[1]?.txnId);
  });

  it("lets a whitespace agent block a later person, and accepts a label map or a replacement reader", () => {
    const blocked = groupHistoryDatoms([
      { txn_id: "t", agent: "  ", attribute: "x", value: "a" },
      {
        txn_id: "t",
        agent: "http://example.test/base/p/abc",
        attribute: "y",
        value: "b",
      },
    ]);
    expect(blocked[0]?.agent).toBe("  ");
    expect(blocked[0]?.who).toBe("Unknown actor");

    const named = groupHistoryDatoms(
      [
        {
          txn_id: "t",
          attribute: "a:example",
          value: "http://example.test/base/e/abc",
        },
      ],
      { labels: new Map([["abc", "The name"]]) },
    );
    expect(named[0]?.changes[0]?.summary).toBe("The name");

    const replaced = groupHistoryDatoms(
      [{ txn_id: "t", attribute: "x", value: "a", agent: "ignored" }],
      {
        describeAgent: () => ({ who: "Stub", whoKind: "system", agentLabel: "stub" }),
      },
    );
    expect(replaced[0]?.who).toBe("Stub");
    expect(replaced[0]?.agentLabel).toBe("stub");
  });

  it("keeps an exact-match address when it is the priority row", () => {
    const events = groupHistoryDatoms([
      {
        txn_id: "t",
        attribute: "http://www.w3.org/2004/02/skos/core#exactMatch",
        value: "http://example.test/base/t/Foo",
      },
      { txn_id: "t", attribute: "noise", value: "no" },
    ]);
    expect(events[0]?.changes).toEqual([
      {
        op: "assert",
        attribute: "http://www.w3.org/2004/02/skos/core#exactMatch",
        attributeLabel: "exactMatch",
        summary: "Foo",
      },
    ]);
  });
});
