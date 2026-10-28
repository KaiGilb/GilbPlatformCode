// The provider the link lines read, and the read-only rule when a host has no writers.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlanFunctionOfValue, PlanPartOf, PlanPartOfSystem, PlanSolutionOf, PlanSolutions, PlanSubFunctions, PlanValueOfFunction } from "./index";
import { Frame, VAULT, labels, makeHost, newClient, row, uri } from "../test/fakeHost";
import { mount } from "../test/mount";
import type { ReactElement } from "react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const k of Object.keys(labels)) delete labels[k];
});

const base = () => ({ vaultId: VAULT, onOpen: vi.fn(), onNotice: vi.fn(), onPicked: vi.fn() });
const record = row("self", "Door");
const edit = () => ({ ...base(), record, canEdit: true, offer: true });

const ALL: [string, () => ReactElement][] = [
  ["PlanPartOf", () => <PlanPartOf {...edit()} />],
  ["PlanSubFunctions", () => <PlanSubFunctions record={record} vaultId={VAULT} onOpen={vi.fn()} />],
  ["PlanFunctionOfValue", () => <PlanFunctionOfValue {...edit()} />],
  ["PlanValueOfFunction", () => <PlanValueOfFunction {...edit()} />],
  ["PlanSolutionOf", () => <PlanSolutionOf {...edit()} />],
  ["PlanSolutions", () => <PlanSolutions {...edit()} />],
  ["PlanPartOfSystem", () => <PlanPartOfSystem {...edit()} onWrite={vi.fn()} />],
];

describe("the provider", () => {
  it.each(ALL)("%s throws an error that names PlanTagLinksHostContext when there is none", (_name, ui) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = makeHost();
    expect(() =>
      render(
        <Frame host={null} pickerHost={h.pickerHost} client={newClient()}>
          {ui()}
        </Frame>,
      ),
    ).toThrow("plan-tag-links: wrap the app in <PlanTagLinksHostContext.Provider value={host}>");
  });
});

describe("a host with no writers", () => {
  const NONE = ["patchRecord", "createRecord", "useCreateRecord", "writePairRelation", "endRelation", "ConnectedCreateDialog"] as const;
  const withLinks = (h: ReturnType<typeof makeHost>) => {
    h.state.relations = {
      isPending: false,
      isError: false,
      data: [
        { relation: "rel-a", role: "role:source", type: "t:SolutionOf", members: [{ member: uri("f1"), role: "role:target" }] },
        { relation: "rel-b", role: "role:target", type: "t:SolutionOf", members: [{ member: uri("f2"), role: "role:source" }] },
      ],
    };
    h.state.finds["a:measures"] = { isError: false, data: { rows: [row("v1", "Speed", { typeUri: "t:Value", facts: { unitTag: "Speed", measures: uri("self") } })], total: 1, capped: false, unread: 0 } };
    labels[uri("f1")] = "Door.One";
    labels[uri("f2")] = "Door.Two";
    labels[uri("p1")] = "Door.Close";
    labels[uri("s1")] = "Core";
    labels[uri("v1")] = "Speed";
  };

  it.each([
    ["PlanPartOf", () => <PlanPartOf {...edit()} record={row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } })} />, "Door.Close"],
    ["PlanFunctionOfValue", () => <PlanFunctionOfValue {...edit()} />, "Speed"],
    ["PlanValueOfFunction", () => <PlanValueOfFunction {...edit()} record={row("self", "Door", { facts: { unitTag: "Door", measures: uri("f1") } })} />, "Door.One"],
    ["PlanSolutionOf", () => <PlanSolutionOf {...edit()} />, "Door.One"],
    ["PlanSolutions", () => <PlanSolutions {...edit()} />, "Door.Two"],
    ["PlanPartOfSystem", () => <PlanPartOfSystem {...edit()} onWrite={vi.fn()} record={row("self", "Door", { facts: { unitTag: "Door", partOf: uri("s1") } })} />, "Core"],
  ])("%s still shows what is linked, and draws nothing to edit", (_n, ui, text) => {
    const h = makeHost({ without: NONE });
    withLinks(h);
    mount(ui(), h);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryAllByLabelText(/^Remove /)).toEqual([]);
    expect(screen.queryByText("+ Value")).toBeNull();
  });

  it("is the same as canEdit false: the rows are identical", () => {
    const h1 = makeHost({ without: NONE });
    withLinks(h1);
    const a = mount(<PlanSolutionOf {...edit()} />, h1);
    const noWriters = a.view.container.innerHTML;
    cleanup();
    const h2 = makeHost();
    withLinks(h2);
    const b = mount(<PlanSolutionOf {...edit()} canEdit={false} />, h2);
    expect(b.view.container.innerHTML).toBe(noWriters);
  });

  it("never calls a writer, or the create hook", () => {
    const h = makeHost({ without: NONE });
    withLinks(h);
    mount(<PlanSolutions {...edit()} />, h);
    expect(h.fn.useCreateRecord).not.toHaveBeenCalled();
    expect(h.names()).toEqual([]);
  });

  it("keeps the hook order: the other hooks are still called, once per render, in the same place", () => {
    const h = makeHost({ without: NONE });
    mount(<PlanSolutionOf {...edit()} />, h);
    expect(h.fn.useRecords).toHaveBeenCalledWith(VAULT);
    expect(h.fn.useRelations).toHaveBeenCalledWith("self", uri("self"));
  });
});
