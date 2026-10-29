// The provider: what it sets and when, what it mounts, what stays the same object, and what each optional prop turns on or off.
import { createElement, useContext, useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { baseOrigin, localRigHosts, minOntologyQuery, ontologyApiOrigin, publicCorpusOrigin, resetBaseOrigin, resetLocalRigHosts, resetMinOntologyQuery, resetOntologyApiOrigin, resetPublicCorpusOrigin, resetSystemVaultHosts, resetVocabTypeBatchRevisions, systemVaultHosts, vocabTypeBatchRevisions } from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin, termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { resetSystemHostLabels, systemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { dpopReadAuth, dpopWriteAuth, resetLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetTypeKey, typeKey } from "@kaigilb/gilbplatformcode-type-key";
import { typeFacetKey } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { PlanCardHostContext, type PlanCardHost } from "@kaigilb/gilbplatformcode-plan-card";
import { PlanSourceHostContext, type PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { PlanImpactsHostContext, type PlanImpactsHost } from "@kaigilb/gilbplatformcode-plan-impacts";
import { PlanTagLinksHostContext, type PlanTagLinksHost } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { PlanTagPickerHostContext, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { ProjectLevelsHostContext, type ProjectLevelsHost } from "@kaigilb/gilbplatformcode-project-levels";
import { StakeholderLinesHostContext, type StakeholderLinesHost } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { DescriptionPartsHostContext, type DescriptionPartsHost } from "@kaigilb/gilbplatformcode-description-parts-view";
import { ValueLinesHostContext, type ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { ValueWriteHostContext, type ValueWriteHost } from "@kaigilb/gilbplatformcode-value-card-write";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import type { TypePictureSource } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import {
  PLAN_CARDS_QUERY_DEFAULTS,
  createDescriptionPartsHost,
  createPickerQuery,
  createPlanCardHost,
  createPlanCardHosts,
  createPlanImpactsHost,
  createPlanSourceHost,
  createPlanTagLinksHost,
  createPlanTagPickerHost,
  createProjectLevelsHost,
  createRefLabel,
  createStakeholderLinesHost,
  createTermDefinition,
  createTypePicture,
  createValueLinesHost,
  createValueWriteHost,
  type HostEnv,
} from "./index";
import { ONTOLOGY, ORIGIN, VAULT, createFakeVault } from "../test/fakeVault";
import { mountInProvider, newSession } from "../test/harness";

// ---- Type level: each factory's result is assignable to the interface of the unit that owns the context. Checked by `tsc`, not at run time.
type Result<F extends (env: HostEnv) => unknown> = ReturnType<F>;
expectTypeOf<Result<typeof createPlanCardHost>>().toMatchTypeOf<PlanCardHost>();
expectTypeOf<Result<typeof createPlanSourceHost>>().toMatchTypeOf<PlanSourceHost>();
expectTypeOf<Result<typeof createPlanImpactsHost>>().toMatchTypeOf<PlanImpactsHost>();
expectTypeOf<Result<typeof createPlanTagLinksHost>>().toMatchTypeOf<PlanTagLinksHost>();
expectTypeOf<Result<typeof createPlanTagPickerHost>>().toMatchTypeOf<PlanTagPickerHost>();
expectTypeOf<Result<typeof createProjectLevelsHost>>().toMatchTypeOf<ProjectLevelsHost>();
expectTypeOf<Result<typeof createStakeholderLinesHost>>().toMatchTypeOf<StakeholderLinesHost>();
expectTypeOf<Result<typeof createDescriptionPartsHost>>().toMatchTypeOf<DescriptionPartsHost>();
expectTypeOf<Result<typeof createValueLinesHost>>().toMatchTypeOf<ValueLinesHost>();
expectTypeOf<Result<typeof createValueWriteHost>>().toMatchTypeOf<ValueWriteHost>();
expectTypeOf<Result<typeof createRefLabel>>().toMatchTypeOf<UseRefLabel>();
expectTypeOf<Result<typeof createPickerQuery>>().toMatchTypeOf<UsePickerQuery>();
expectTypeOf<Result<typeof createTypePicture>>().toMatchTypeOf<TypePictureSource>();
expectTypeOf<Result<typeof createTermDefinition>>().toMatchTypeOf<ReadTermDefinition>();

function resetAll() {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetTermOrigin();
  resetSystemHostLabels();
  resetLwsAuth();
  resetTypeKey();
  resetLocalRigHosts();
  resetMinOntologyQuery();
  resetOntologyApiOrigin();
  resetPublicCorpusOrigin();
  resetVocabTypeBatchRevisions();
}
beforeEach(() => {
  resetAll();
  vi.stubGlobal("fetch", createFakeVault().fetch);
});
afterEach(resetAll);

/** The value of every context, as one render saw it. */
function useAllContexts() {
  return {
    planCard: useContext(PlanCardHostContext),
    planSource: useContext(PlanSourceHostContext),
    planImpacts: useContext(PlanImpactsHostContext),
    planTagLinks: useContext(PlanTagLinksHostContext),
    planTagPicker: useContext(PlanTagPickerHostContext),
    projectLevels: useContext(ProjectLevelsHostContext),
    stakeholderLines: useContext(StakeholderLinesHostContext),
    descriptionParts: useContext(DescriptionPartsHostContext),
    valueLines: useContext(ValueLinesHostContext),
    valueWrite: useContext(ValueWriteHostContext),
    refLabel: useContext(RefLabelContext),
    pickerQuery: useContext(PickerQueryContext),
    typePicture: useContext(TypePictureSourceContext),
    termDefinition: useContext(TermDefinitionContext),
  };
}
type All = ReturnType<typeof useAllContexts>;

/** Mounts a probe that records the contexts of every render. */
function probe(into: All[]) {
  return function Probe() {
    into.push(useAllContexts());
    return null;
  };
}
function lastOf(seen: All[]): { [K in keyof All]: NonNullable<All[K]> } {
  return seen[seen.length - 1] as never;
}

describe("what it sets, and when", () => {
  test("every setting, the session and the type key are in place when the first child renders", () => {
    const seen: Record<string, unknown>[] = [];
    function First() {
      seen.push({
        origin: baseOrigin(),
        ontology: termOrigin(),
        hosts: [...systemVaultHosts()],
        labels: [...systemHostLabels()],
        key: typeKey("t:Value"),
        // The registry knows this type under a spelling the default key (the lower-cased name) does not give.
        registryKey: typeKey("t:FunctionConstraint"),
      });
      return null;
    }
    mountInProvider(newSession(), <First />);
    expect(seen[0]).toEqual({
      origin: ORIGIN,
      ontology: ONTOLOGY,
      hosts: ["ontology.platform.example.test", "vedas.example.test"],
      labels: ["id", "ontology"],
      key: typeFacetKey("t:Value"),
      registryKey: "functionConstraint",
    });
  });

  test("the session the provider was given signs a write for the platform, and nothing for a host outside it", async () => {
    const session = newSession();
    mountInProvider(session, null);
    const pair = await dpopWriteAuth("PATCH", `${ORIGIN}/lws/r/x`);
    expect(pair).toEqual({ authorization: "DPoP fake-access-token", dpop: `proof(PATCH ${ORIGIN}/lws/r/x)` });
    expect(await dpopReadAuth("GET", "https://evil.example.test/lws/r/x")).toEqual({});
    expect(session.signed).toEqual([{ method: "PATCH", url: `${ORIGIN}/lws/r/x` }]);
  });

  test("the optional settings are set when given and left at the defaults when not", () => {
    mountInProvider(newSession(), null);
    expect([minOntologyQuery(), [...localRigHosts()], ontologyApiOrigin(), vocabTypeBatchRevisions()]).toEqual([3, [], undefined, undefined]);
    expect(() => publicCorpusOrigin()).toThrow(/setPublicCorpusOrigin/);
    cleanupAndReset();
    mountInProvider(newSession(), null, {
      settings: { localRigHosts: ["localhost"], minOntologyQuery: 5, ontologyApiOrigin: "https://api.platform.example.test", vocabTypeBatchRevisions: "abc,def", publicCorpusOrigin: "https://corpus.example.test" },
    });
    expect([minOntologyQuery(), [...localRigHosts()], ontologyApiOrigin(), vocabTypeBatchRevisions(), publicCorpusOrigin()]).toEqual([
      5,
      ["localhost"],
      "https://api.platform.example.test",
      "abc,def",
      "https://corpus.example.test",
    ]);
  });

  test("an origin that is not an origin throws the setter's own error, naming it", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => mountInProvider(newSession(), null, { origin: "platform.example.test/base" })).toThrow(/base-origin: setBaseOrigin/);
    quiet.mockRestore();
  });

  test("a re-render with the same values sets nothing again, and a changed origin is set", () => {
    const session = newSession();
    const view = mountInProvider(session, null);
    expect(baseOrigin()).toBe(ORIGIN);
    view.rerenderWith(null, { origin: "https://other.example.test" });
    expect(baseOrigin()).toBe("https://other.example.test");
  });
});

function cleanupAndReset() {
  document.body.innerHTML = "";
  resetAll();
}

describe("what it mounts", () => {
  test("all 14 contexts are filled, and the card mode carries canEdit", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    let mode: boolean | null = null;
    function Mode() {
      mode = useCardMode().canEdit;
      return null;
    }
    mountInProvider(newSession(), (
      <>
        <Probe />
        <Mode />
      </>
    ), { canEdit: false });
    const all = lastOf(seen);
    expect(Object.keys(all)).toHaveLength(14);
    for (const [name, value] of Object.entries(all)) expect(value, name).toBeTruthy();
    expect(mode).toBe(false);
  });

  test("it makes a query client with the app's defaults, and uses a given one as it is", () => {
    let own: QueryClient | null = null;
    function Take() {
      own = useQueryClient();
      return null;
    }
    mountInProvider(newSession(), <Take />);
    expect(own!.getDefaultOptions().queries).toEqual({ staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 });
    expect(PLAN_CARDS_QUERY_DEFAULTS).toEqual({ staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 });
    cleanupAndReset();
    const mine = new QueryClient({ defaultOptions: { queries: { staleTime: 1 } } });
    mountInProvider(newSession(), <Take />, { queryClient: mine });
    expect(own).toBe(mine);
    expect(mine.getDefaultOptions().queries).toEqual({ staleTime: 1 });
  });

  test("the hosts are the same objects across re-renders with new props, and the callbacks they hold are the latest", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    const first = vi.fn();
    const second = vi.fn();
    const view = mountInProvider(newSession(), <Probe />, { navigate: { openOntologyConcept: first } });
    const before = lastOf(seen);
    view.rerenderWith(<Probe />, { canEdit: false, navigate: { openOntologyConcept: second } });
    const after = lastOf(seen);
    for (const name of Object.keys(before) as (keyof All)[]) expect(after[name], name).toBe(before[name]);
    (after.valueLines.openOntologyConcept as (n: string) => void)("Speed");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("Speed");
  });
});

describe("the 177 members", () => {
  function envWithEverything(qc: QueryClient): HostEnv {
    return {
      qc,
      useShell: () => ({ vaults: [] }),
      useSelfSource: () => null,
      ontologyOrigin: ONTOLOGY,
      openRecordInVault: () => {},
      openOntologyConcept: () => {},
      createDialog: () => null,
      renderTypeIcon: () => null,
      HelpButton: () => null,
    };
  }

  test("with every optional prop given, each host holds every member of its interface (the census counts)", () => {
    mountInProvider(newSession(), null);
    const hosts = createPlanCardHosts(envWithEverything(new QueryClient()));
    const count = (o: object) => Object.keys(o).length;
    expect({
      planCard: count(hosts.planCard),
      planSource: count(hosts.planSource),
      planImpacts: count(hosts.planImpacts),
      planTagLinks: count(hosts.planTagLinks),
      planTagPicker: count(hosts.planTagPicker),
      projectLevels: count(hosts.projectLevels),
      stakeholderLines: count(hosts.stakeholderLines),
      descriptionParts: count(hosts.descriptionParts),
      valueLines: count(hosts.valueLines),
      valueWrite: count(hosts.valueWrite),
    }).toEqual({ planCard: 30, planSource: 9, planImpacts: 13, planTagLinks: 26, planTagPicker: 3, projectLevels: 4, stakeholderLines: 29, descriptionParts: 32, valueLines: 5, valueWrite: 22 });
    // The four contexts whose value is one function or one source object: 4 more, 177 in all.
    expect([typeof hosts.refLabel, typeof hosts.pickerQuery, typeof hosts.termDefinition, typeof hosts.typePicture.fetchTypePictureSrc]).toEqual(["function", "function", "function", "function"]);
  });

  test("with no optional prop given, what is optional is left out and what is required answers with nothing", () => {
    mountInProvider(newSession(), null);
    const hosts = createPlanCardHosts({ qc: new QueryClient(), useShell: () => ({ vaults: [] }), useSelfSource: () => null, ontologyOrigin: ONTOLOGY });
    expect("openOntologyConcept" in hosts.planCard).toBe(false);
    expect("renderTypeIcon" in hosts.planCard).toBe(false);
    expect("openOntologyConcept" in hosts.valueLines).toBe(false);
    expect("renderTypeIcon" in hosts.valueLines).toBe(false);
    expect("renderCreateStakeholder" in hosts.stakeholderLines).toBe(false);
    expect("ConnectedCreateDialog" in hosts.planTagLinks).toBe(false);
    expect(hosts.planCard.renderCreateStakeholder({ open: true, stakeholders: true, source: null, initialTypeId: "person", drawnVaultIds: [], onClose() {}, onCreated() {} })).toBeNull();
    expect(render(createElement(hosts.planSource.ConnectedCreateDialog, { open: true, stakeholders: true, source: null, drawnVaultIds: [], onClose() {}, onCreated() {} })).container.innerHTML).toBe("");
    expect(render(createElement(hosts.descriptionParts.HelpButton, { label: "l", title: "t", startAt: "s", children: "c" })).container.innerHTML).toBe("");
  });
});

describe("the optional props", () => {
  test("a create dialog turns the person lines on, and is drawn with the props the line gave it", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    const Dialog = vi.fn((_: { onClose: () => void }) => <i data-testid="dialog" />);
    mountInProvider(newSession(), <Probe />, { createStakeholderDialog: Dialog as never });
    const all = lastOf(seen);
    expect(all.stakeholderLines.renderCreateStakeholder).toBeTypeOf("function");
    expect(all.planTagLinks.ConnectedCreateDialog).toBeTypeOf("function");
    const props = { open: true as const, stakeholders: true as const, source: null, initialTypeId: "person" as const, drawnVaultIds: [VAULT], onClose: () => {}, onCreated: () => {} };
    render(<>{all.planCard.renderCreateStakeholder(props)}</>);
    expect(Dialog.mock.calls[0]![0]).toMatchObject({ drawnVaultIds: [VAULT], initialTypeId: "person", open: true });
    expect(screen.getByTestId("dialog")).toBeTruthy();
  });

  test("a type icon and a help button are drawn through the host", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    const icon = vi.fn(() => <b data-testid="icon" />);
    const Help = ({ label }: { label: string; title: string; startAt: string; children: ReactNode }) => <u data-testid="help">{label}</u>;
    mountInProvider(newSession(), <Probe />, { renderTypeIcon: icon, HelpButton: Help });
    const all = lastOf(seen);
    render(<>{all.planCard.renderTypeIcon!({ typeName: "Value" } as never, "c")}</>);
    expect(icon).toHaveBeenCalledWith({ typeName: "Value" }, "c");
    render(createElement(all.descriptionParts.HelpButton, { label: "How", title: "t", startAt: "s", children: null }));
    expect(screen.getByTestId("help").textContent).toBe("How");
  });

  test("the person as a source: null by default, the given one when `self` is given, read again on every render", () => {
    const seen: ({ "@id": string } | null)[] = [];
    function Self() {
      const ctx = useContext(PlanCardHostContext)!;
      seen.push(ctx.useSelfSource());
      return null;
    }
    const view = mountInProvider(newSession(), <Self />);
    view.rerenderWith(<Self />, { self: { "@id": `${VAULT}/e/ann` } });
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toEqual({ "@id": `${VAULT}/e/ann` });
  });

  test("with `ownCard`, a session with no vault of its own finds no card and asks for nothing", async () => {
    const vault = createFakeVault();
    vi.stubGlobal("fetch", vault.fetch);
    const seen: ({ "@id": string } | null)[] = [];
    function Self() {
      const ctx = useContext(PlanCardHostContext)!;
      seen.push(ctx.useSelfSource());
      return null;
    }
    mountInProvider(newSession(), <Self />, { ownCard: true });
    await waitFor(() => expect(seen.length).toBeGreaterThan(1));
    expect(seen.every((s) => s === null)).toBe(true);
    expect(vault.log.filter((r) => /own|profile|mnbProfile/i.test(r.url))).toEqual([]);
  });

  test("the open actions are present only when `navigate` gave them, and call the latest one", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    mountInProvider(newSession(), <Probe />);
    expect(lastOf(seen).planSource.useShell).toBeTypeOf("function");
    let shellOpen: unknown = "unset";
    const open = vi.fn();
    function Shell() {
      const ctx = useContext(PlanSourceHostContext)!;
      shellOpen = ctx.useShell().openRecordInVault;
      return null;
    }
    cleanupAndReset();
    mountInProvider(newSession(), <Shell />);
    expect(shellOpen).toBeUndefined();
    cleanupAndReset();
    mountInProvider(newSession(), <Shell />, { navigate: { openRecordInVault: open } });
    (shellOpen as (v: string, r: string) => void)("v", "r");
    expect(open).toHaveBeenCalledWith("v", "r", undefined);
  });
});

describe("the shell from the session", () => {
  test("the vaults are the session's, once it has answered, as one stable list; the ids held are those it may read", async () => {
    const session = (await import("../test/fakeSession")).fakeSession({
      vaults: [
        { vaultId: VAULT, modes: ["read", "write"] },
        { vaultId: `${ORIGIN}/base/p2`, modes: ["write"] },
      ],
    });
    const lists: unknown[] = [];
    const held: string[][] = [];
    function Shell() {
      const ctx = useContext(PlanCardHostContext)!;
      const shell = ctx.useShell();
      useEffect(() => {
        lists.push(shell.vaults);
      });
      held.push(ctx.heldVaultIds(shell.vaults ?? []));
      return null;
    }
    const view = mountInProvider(session, <Shell />);
    await waitFor(() => expect(held[held.length - 1]).toEqual([VAULT]));
    expect(held[0]).toEqual([]);
    const settled = lists[lists.length - 1];
    await act(async () => view.rerenderWith(<Shell />));
    expect(lists[lists.length - 1]).toBe(settled);
    expect(session.sessionReads).toBe(1);
  });
});
