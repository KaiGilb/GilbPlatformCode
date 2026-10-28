import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import * as unit from "./index";
import { ValueWriteHostContext, useValueWriteHost } from "./host";

describe("what the unit exports", () => {
  it("is the hooks, the functions, the two classes and the host context at run time, and nothing else", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "ChildConflict",
      "MoveStopped",
      "ValueWriteHostContext",
      "createChild",
      "endChild",
      "endMade",
      "endRow",
      "findRowsOf",
      "httpStatus",
      "migrateChild",
      "patchChild",
      "rowFor",
      "rowLabel",
      "useChildList",
      "useValueLevels",
      "useValueMeters",
      "useValueQualifiers",
      "useValueScale",
    ]);
    expect(unit.ValueWriteHostContext).toBe(ValueWriteHostContext);
  });

  it("has a context with no host by default", () => {
    expect((ValueWriteHostContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });
});

describe("a hook used without a provider", () => {
  const record = { id: "v", entityUri: "https://h.example.test/base/e/v", typeUri: "t:Value", facts: {}, opaqueFacts: [], etag: null };
  const common = { enabled: true, record, vaultId: "https://p.example.test/vault", planVault: "https://h.example.test/base", onNotice: () => {} };
  const cases: [string, () => unknown][] = [
    ["useValueWriteHost", () => useValueWriteHost()],
    ["useValueLevels", () => unit.useValueLevels({ ...common, rows: [], variableOrder: [] })],
    ["useValueMeters", () => unit.useValueMeters({ ...common, rows: [] })],
    ["useValueQualifiers", () => unit.useValueQualifiers({ ...common, rows: [] })],
    ["useValueScale", () => unit.useValueScale(common)],
  ];
  it.each(cases)("%s throws a sentence that names the provider", (_name, call) => {
    expect(() => renderHook(call)).toThrow(/ValueWriteHostContext\.Provider/);
  });
});
