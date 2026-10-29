// The four whole Plan cards drawn inside the provider ALONE, against a fake `fetch` that serves a small vault: each card draws the lines
// its README lists, one edit is one signed PATCH, a record that names another host gets no credential, and a context left out still
// names itself. Every wait is for something the page or the fake vault shows, never for time.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { __startCardsInEditMode, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { ValueCard } from "@kaigilb/gilbplatformcode-value-card";
import { FunctionCard } from "@kaigilb/gilbplatformcode-function-card";
import { SolutionCard } from "@kaigilb/gilbplatformcode-solution-card";
import { ResourceCard } from "@kaigilb/gilbplatformcode-resource-card";
import { PlanCardHostContext } from "@kaigilb/gilbplatformcode-plan-card";
import { PlanSourceHostContext } from "@kaigilb/gilbplatformcode-plan-source";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext } from "@kaigilb/gilbplatformcode-record-picker";
import { ValueLinesHostContext } from "@kaigilb/gilbplatformcode-value-line-kit";
import { StakeholderLinesHostContext } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { PlanTagLinksHostContext } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { PlanTagPickerHostContext } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { PlanImpactsHostContext } from "@kaigilb/gilbplatformcode-plan-impacts";
import { DescriptionPartsHostContext } from "@kaigilb/gilbplatformcode-description-parts-view";
import { ProjectLevelsHostContext } from "@kaigilb/gilbplatformcode-project-levels";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import { TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { bearerHeaderFor } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { createPlanCardHosts } from "./hosts";
import { applyPlatformSetup } from "./settings";
import { ONTOLOGY, ORIGIN, VAULT, createFakeVault, entityUriOf, type ServedRecord } from "../test/fakeVault";
import { levelRecord, meterRecords, qualifierRecord, scaleRecord, served } from "../test/seed";
import { Screen, SYSTEM_VAULT_HOSTS, mountInProvider, newSession, planGroups, type FakeVault } from "../test/harness";

// The `data-group` lists the card READMEs give, in Edit with every group shown.
const VALUE_GROUPS = ["plan-type-level", "plan-picture", "plan-scale", "plan-endpoint", "plan-scale-variables", "plan-value-levels", "plan-value-meters", "plan-stakeholder", "plan-function-of-value", "plan-description", "plan-authority", "plan-type"];
const FUNCTION_GROUPS = ["plan-type-level", "plan-description", "plan-stakeholder", "plan-authority", "plan-part-of", "plan-sub-functions", "plan-meter", "plan-status", "plan-function-of-value", "plan-solutions", "plan-type"];
const SOLUTION_GROUPS = ["plan-type-level", "plan-description", "plan-stakeholder", "plan-authority", "plan-type", "plan-meter", "plan-status", "plan-impacts", "plan-solution-of", "plan-part-of-system"];
const RESOURCE_GROUPS = ["plan-type-level", "plan-picture", "plan-scale", "plan-endpoint", "plan-scale-variables", "plan-value-levels", "plan-value-meters", "plan-resource-owner", "plan-stakeholder", "plan-description", "plan-authority", "plan-type"];

/** A small vault: a Value with a Scale, a level, a qualifier and a Meter; a Function with one sub-function; a Solution; a Resource. */
function smallVault(extra: ServedRecord[] = []): FakeVault {
  const val = entityUriOf("val1");
  const m = meterRecords(val, 1, { "a:meterQualifier": "During Development", lines: [{ "a:meterAgentKind": "human", "a:meterMethod": "review" }] });
  return createFakeVault([
    { id: "val1", type: "t:Value", facts: { unitTag: "Speed", hasScale: { "@id": entityUriOf("scale1") } }, version: 1 },
    served(levelRecord(val, 1, { levelKind: "Goal", levelValue: 5 })),
    served(qualifierRecord(val, 1, { "a:name": "Release", "a:definition": "A release of the product" })),
    served(m.meter),
    ...m.lines.map(served),
    served(scaleRecord(val, { "a:unit": "min" })),
    { id: "fn1", type: "t:Function", facts: { unitTag: "Content.Measure" }, version: 1 },
    { id: "fn2", type: "t:Function", facts: { unitTag: "Content.Measure.Sub", fvParent: { "@id": entityUriOf("fn1") } }, version: 1 },
    { id: "sol1", type: "t:Solution", facts: { unitTag: "Hinge.Tighten" }, version: 1 },
    { id: "res1", type: "t:Resource", facts: { unitTag: "Cost.RiverProject" }, version: 1 },
    ...extra,
  ]);
}

beforeEach(() => __startCardsInEditMode(true));
afterEach(() => __startCardsInEditMode(false));

describe("each whole card draws inside the provider alone", () => {
  test.each([
    ["ValueCard", ValueCard, "val1", VALUE_GROUPS],
    ["FunctionCard", FunctionCard, "fn1", FUNCTION_GROUPS],
    ["SolutionCard", SolutionCard, "sol1", SOLUTION_GROUPS],
    ["ResourceCard", ResourceCard, "res1", RESOURCE_GROUPS],
  ] as const)("%s draws its lines", async (_name, Card, id, groups) => {
    const vault = smallVault();
    vi.stubGlobal("fetch", vault.fetch);
    const session = newSession();
    mountInProvider(session, <Screen Card={Card} vault={vault} id={id} />);
    await waitFor(() => expect(planGroups()).toEqual(groups));
    // The reads went out signed through the session the provider was given.
    await waitFor(() => expect(vault.requests("GET", /\/base\/find-by-attribute\?/).length).toBeGreaterThan(0));
    for (const r of vault.requests("GET", /\/base\/find-by-attribute\?|\/lws\/r\//)) {
      expect(r.headers.authorization).toBe("DPoP fake-access-token");
      expect(r.headers.dpop).toBe(`proof(GET ${r.url})`);
    }
  });

  test("the Value card shows the Scale it read from the vault, and the Function card the sub-function it found", async () => {
    const vault = smallVault();
    vi.stubGlobal("fetch", vault.fetch);
    mountInProvider(newSession(), (
      <>
        <Screen Card={ValueCard} vault={vault} id="val1" />
        <Screen Card={FunctionCard} vault={vault} id="fn1" />
      </>
    ));
    await waitFor(() => expect((screen.getByLabelText("Scale unit") as HTMLInputElement).value).toBe("min"));
    await waitFor(() => expect(document.querySelector('[data-group="plan-sub-functions"]')?.textContent).toContain("Sub"));
  });
});

describe("one edit is one signed PATCH", () => {
  test("typing in the Endpoint of a Value sends one merge-patch to the record, signed by the session, conditional on its version; the next is conditional on the version the first returned", async () => {
    const vault = smallVault();
    vi.stubGlobal("fetch", vault.fetch);
    const session = newSession();
    mountInProvider(session, <Screen Card={ValueCard} vault={vault} id="val1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText("Subject words")).toBeTruthy());
    const box = screen.getByLabelText("Subject words");
    await user.click(box);
    await user.type(box, "the app");
    await user.tab();
    await waitFor(() => expect(vault.requests("PATCH", /./)).toHaveLength(1));

    const url = `${ORIGIN}/lws/r/val1`;
    const sent = vault.requests("PATCH", /./)[0]!;
    expect(sent.url).toBe(url);
    expect(sent.headers.authorization).toBe("DPoP fake-access-token");
    expect(sent.headers.dpop).toBe(`proof(PATCH ${url})`);
    expect(sent.headers["content-type"]).toBe("application/merge-patch+json");
    expect(sent.headers["if-match"]).toBe('"v1"');
    const body = JSON.parse(sent.body!) as Record<string, { "a:endpointSubject": { "a:description": string } }>;
    expect(Object.keys(body)).toEqual(["a:endpoint"]);
    expect(body["a:endpoint"]!["a:endpointSubject"]["a:description"]).toBe("the app");
    expect(session.signed).toContainEqual({ method: "PATCH", url });
    // The vault kept it, and handed back a new version.
    expect(vault.records.get("val1")!.version).toBe(2);

    const ref = screen.getByLabelText("Reference words");
    await user.click(ref);
    await user.type(ref, "the bus");
    await user.tab();
    await waitFor(() => expect(vault.requests("PATCH", /./)).toHaveLength(2));
    expect(vault.requests("PATCH", /./)[1]!.headers["if-match"]).toBe('"v2"');
    expect(vault.requests("PATCH", /./)[1]!.body).toContain("the bus");
    expect(vault.requests("PATCH", /./)[1]!.body).toContain("the app");
  });

  test("changing a level is one PATCH of that level's record, conditional on the version it was read at", async () => {
    const vault = smallVault();
    vi.stubGlobal("fetch", vault.fetch);
    mountInProvider(newSession(), <Screen Card={ValueCard} vault={vault} id="val1" />);
    const user = userEvent.setup();
    await waitFor(() => expect((screen.getByLabelText("Level 1 value") as HTMLInputElement).value).toBe("5"));
    const box = screen.getByLabelText("Level 1 value");
    await user.clear(box);
    await user.type(box, "7");
    await user.tab();
    await waitFor(() => expect(vault.requests("PATCH", /./)).toHaveLength(1));
    const sent = vault.requests("PATCH", /./)[0]!;
    expect(sent.url).toBe(`${ORIGIN}/lws/r/lvl1`);
    expect(sent.headers["if-match"]).toBe('"v1"');
    expect(sent.headers.authorization).toBe("DPoP fake-access-token");
    expect(sent.headers.dpop).toBe(`proof(PATCH ${ORIGIN}/lws/r/lvl1)`);
    expect(sent.body).toContain("7");
    expect(vault.records.get("lvl1")!.version).toBe(2);
    expect(vault.created).toEqual([]);
  });

  test("writing a value in a blank level creates one record in the vault, signed with the write credential, and does not touch the Value", async () => {
    const vault = createFakeVault([{ id: "val1", type: "t:Value", facts: { unitTag: "Speed" }, version: 1 }]);
    vi.stubGlobal("fetch", vault.fetch);
    const session = newSession();
    mountInProvider(session, <Screen Card={ValueCard} vault={vault} id="val1" />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText("Level 1 value")).toBeTruthy());
    const box = screen.getByLabelText("Level 1 value");
    await user.click(box);
    await user.type(box, "5");
    await user.tab();
    await waitFor(() => expect(vault.created).toHaveLength(1));
    const post = vault.requests("POST", /./)[0]!;
    expect(post.url).toBe(`${ORIGIN}/lws/vault/${encodeURIComponent(VAULT)}/c`);
    expect(post.headers.authorization).toBe("DPoP fake-access-token");
    expect(post.headers.dpop).toBe(`proof(POST ${post.url})`);
    const made = vault.created[0]!;
    expect(made.type).toMatch(/Status$/);
    expect(made.facts.partOf).toEqual({ "@id": entityUriOf("val1") });
    expect(made.facts.scaleNumber).toBe("5");
    expect(vault.requests("PATCH", /./)).toHaveLength(0);
  });

  test("a card whose person may not write sends nothing", async () => {
    const vault = smallVault();
    vi.stubGlobal("fetch", vault.fetch);
    mountInProvider(newSession(), <Screen Card={ValueCard} vault={vault} id="val1" canEdit={false} />, { canEdit: false });
    await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
    await waitFor(() => expect(vault.requests("GET", /\/base\/find-by-attribute\?/).length).toBeGreaterThan(0));
    expect(screen.queryByLabelText("Subject words")).toBeNull();
    expect(vault.requests("PATCH", /./)).toHaveLength(0);
  });
});

describe("the credential gate", () => {
  test("a record that names a host outside the platform's family is read at its own host without a credential; one that names an unknown host is not asked at all", async () => {
    const vault = smallVault([
      { id: "sys1", uri: "https://vedas.example.test/base/e/sys1", type: "t:Function", facts: { unitTag: "Content.Measure.Far", fvParent: { "@id": entityUriOf("fn1") } }, version: 1 },
      { id: "evil1", uri: "https://evil.example.test/base/e/evil1", type: "t:Function", facts: { unitTag: "Content.Measure.Evil", fvParent: { "@id": entityUriOf("fn1") } }, version: 1 },
    ]);
    vi.stubGlobal("fetch", vault.fetch);
    const session = newSession();
    mountInProvider(session, <Screen Card={FunctionCard} vault={vault} id="fn1" />);
    // The sub-function on the system host is read (so the test is not vacuous) and shown.
    await waitFor(() => expect(document.querySelector('[data-group="plan-sub-functions"]')?.textContent).toContain("Far"));
    const toSystemHost = vault.log.filter((r) => new URL(r.url).host === "vedas.example.test");
    expect(toSystemHost.length).toBeGreaterThan(0);
    for (const r of toSystemHost) {
      expect(r.headers.authorization).toBeUndefined();
      expect(r.headers.dpop).toBeUndefined();
    }
    // A host the platform does not know is never asked; the read goes to the origin instead.
    expect(vault.log.filter((r) => new URL(r.url).host === "evil.example.test")).toHaveLength(0);
    // Nothing the session signed was for a host outside the platform's family, and no signed request left for one.
    expect(session.signed.length).toBeGreaterThan(0);
    for (const s of session.signed) expect(new URL(s.url).host).toBe("platform.example.test");
    for (const r of vault.log.filter((l) => l.headers.authorization !== undefined)) expect(new URL(r.url).host).toBe("platform.example.test");
    // The same rule through the seam itself.
    expect(await bearerHeaderFor("https://evil.example.test/lws/r/x", "GET")).toEqual({});
    expect(await bearerHeaderFor("https://vedas.example.test/lws/r/x", "GET")).toEqual({});
    expect(Object.keys(await bearerHeaderFor(`${ORIGIN}/lws/r/x`, "GET")).sort()).toEqual(["authorization", "dpop"]);
  });
});

describe("a linked record that holds no name and no unitTag is named by its main tag", () => {
  /** A Value of the Function `fn1` that holds no name and no unitTag, in the platform's own vault, and one on the second system host. */
  const nameless = (id: string, mainTag: string | undefined, uri?: string): ServedRecord => ({
    id,
    ...(uri ? { uri } : {}),
    type: "t:Value",
    facts: { measures: { "@id": entityUriOf("fn1") } },
    version: 1,
    ...(mainTag ? { mainTag } : {}),
  });
  const valueLine = () => document.querySelector('[data-group="plan-function-of-value"]')?.textContent ?? "";

  /** The records one masters request asks about. */
  const askedBy = (r: { body: string | null }) => (JSON.parse(r.body!) as { targetEntities: string[] }).targetEntities;

  test("the Function of Value line shows the main tag of each nameless Value, and asks for the whole line in ONE signed POST to the vault's masters route", async () => {
    const vault = smallVault([nameless("nv1", "Speed.Main"), nameless("nv3", "Speed.Third")]);
    vi.stubGlobal("fetch", vault.fetch);
    const session = newSession();
    mountInProvider(session, <Screen Card={FunctionCard} vault={vault} id="fn1" />);
    await waitFor(() => expect(valueLine()).toContain("Speed.Main"));
    await waitFor(() => expect(valueLine()).toContain("Speed.Third"));
    // The line's own read is the one request that names both records. (The record-name hook reads one record per call besides.)
    const batches = vault.tagReads.filter((r) => askedBy(r).length === 2);
    expect(batches).toHaveLength(1);
    expect([...askedBy(batches[0]!)].sort()).toEqual([entityUriOf("nv1"), entityUriOf("nv3")]);
    expect(JSON.parse(batches[0]!.body!)).toMatchObject({ vault: VAULT });
    const url = `${ORIGIN}/base/tag/masters`;
    for (const read of vault.tagReads) {
      expect(read.url).toBe(url);
      expect(read.headers.authorization).toBe("DPoP fake-access-token");
      expect(read.headers.dpop).toBe(`proof(POST ${url})`);
      expect(askedBy(read).length).toBeLessThanOrEqual(2);
    }
    expect(session.signed).toContainEqual({ method: "POST", url });
    // A read made with POST is not a write: nothing was created or patched, and the write log does not hold it.
    expect(vault.created).toEqual([]);
    expect(vault.requests("PATCH", /./)).toHaveLength(0);
    expect(vault.requests("POST", /./)).toHaveLength(0);
  });

  test("a Value the platform has no main tag for keeps its id tail", async () => {
    const vault = smallVault([nameless("nv2", undefined)]);
    vi.stubGlobal("fetch", vault.fetch);
    mountInProvider(newSession(), <Screen Card={FunctionCard} vault={vault} id="fn1" />);
    await waitFor(() => expect(vault.tagReads.length).toBeGreaterThan(0));
    await waitFor(() => expect(valueLine()).toContain("nv2"));
    expect(valueLine()).not.toContain("Speed.Main");
  });

  test("a Stakeholder chip shows @ and the main tag of the person it links", async () => {
    const ann = entityUriOf("ann");
    const vault = createFakeVault(
      [
        { id: "fn1", type: "t:Function", facts: { unitTag: "Content.Measure" }, version: 1 },
        { id: "ann", type: "t:Person", facts: { label: "Ann" }, version: 1, mainTag: "ada" },
      ],
      { relations: { fn1: [{ relation: `${VAULT}/r/rel1`, role: "role:referenced-by", type: "t:StakeholderOf", members: [{ member: ann, role: "role:stakeholder" }] }] } },
    );
    vi.stubGlobal("fetch", vault.fetch);
    mountInProvider(newSession(), <Screen Card={FunctionCard} vault={vault} id="fn1" />);
    await waitFor(() => expect(screen.getByText("@ada")).toBeTruthy());
    for (const r of vault.tagReads) expect(askedBy(r)).toEqual([ann]);
    expect(vault.tagReads.length).toBeGreaterThan(0);
  });

  test("the masters request of each record goes to that record's own host, and only a record of the platform's family gets a credential", async () => {
    const far = "https://vedas.example.test/base/e/nvfar";
    const vault = smallVault([nameless("nv1", "Speed.Main"), nameless("nvfar", "Far.Main", far)]);
    vi.stubGlobal("fetch", vault.fetch);
    mountInProvider(newSession(), <Screen Card={FunctionCard} vault={vault} id="fn1" />);
    await waitFor(() => expect(valueLine()).toContain("Far.Main"));
    expect(valueLine()).toContain("Speed.Main");
    const byHost = (host: string) => vault.tagReads.filter((r) => new URL(r.url).host === host);
    expect(byHost("platform.example.test").length).toBeGreaterThan(0);
    expect(byHost("vedas.example.test").length).toBeGreaterThan(0);
    // Each request names the records of its own host and no other, at that host's own masters route.
    for (const r of vault.tagReads) {
      expect(askedBy(r).length).toBeGreaterThan(0);
      for (const e of askedBy(r)) expect(new URL(e).host).toBe(new URL(r.url).host);
      expect(new URL(r.url).pathname).toBe("/base/tag/masters");
    }
    for (const r of byHost("vedas.example.test")) {
      expect(askedBy(r)).toEqual([far]);
      expect(r.url).toBe("https://vedas.example.test/base/tag/masters");
      expect(JSON.parse(r.body!)).toMatchObject({ vault: "https://vedas.example.test/base" });
    }
    for (const r of byHost("platform.example.test")) expect(askedBy(r)).toEqual([entityUriOf("nv1")]);
    // The platform's family signs; a host outside it gets no credential (the same gate as every other read).
    for (const r of byHost("platform.example.test")) expect(r.headers.authorization).toBe("DPoP fake-access-token");
    for (const r of byHost("vedas.example.test")) {
      expect(r.headers.authorization).toBeUndefined();
      expect(r.headers.dpop).toBeUndefined();
    }
  });
});

describe("the three main-tag members, each on its own", () => {
  const FAR = "https://vedas.example.test/base/e/far1";
  function hostsOn(vault: FakeVault) {
    vi.stubGlobal("fetch", vault.fetch);
    mountInProvider(newSession(), null); // sets the origins and the session, as the provider does
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const hosts = createPlanCardHosts({ qc, useShell: () => ({ vaults: [] }), useSelfSource: () => null, ontologyOrigin: ONTOLOGY });
    return { hosts, wrapper };
  }
  const vault = () =>
    createFakeVault([
      { id: "nv1", type: "t:Value", facts: {}, version: 1, mainTag: "Speed.Main" },
      { id: "far1", uri: FAR, type: "t:Value", facts: {}, version: 1, mainTag: "Far.Main" },
    ]);
  const rows = [{ entityUri: entityUriOf("nv1"), facts: {} }, { entityUri: FAR, facts: {} }, { entityUri: entityUriOf("named"), facts: { label: "Named" } }];

  test.each([
    ["PlanImpactsHost.useMainTagsForRows", (h: ReturnType<typeof createPlanCardHosts>) => h.planImpacts.useMainTagsForRows],
    ["PlanTagLinksHost.useMainTagsForRows", (h: ReturnType<typeof createPlanCardHosts>) => h.planTagLinks.useMainTagsForRows],
  ])("%s answers the main tag of each row that needs one, asking each record's own host, and asks nothing for a row that holds a name", async (_n, pick) => {
    const v = vault();
    const { hosts, wrapper } = hostsOn(v);
    const { result } = renderHook(() => pick(hosts)(rows), { wrapper });
    await waitFor(() => expect(result.current.get(FAR)).toBe("Far.Main"));
    expect(result.current.get(entityUriOf("nv1"))).toBe("Speed.Main");
    expect(result.current.has(entityUriOf("named"))).toBe(false);
    expect(v.tagReads.map((r) => r.url).sort()).toEqual(["https://platform.example.test/base/tag/masters", "https://vedas.example.test/base/tag/masters"]);
    for (const r of v.tagReads) for (const e of (JSON.parse(r.body!) as { targetEntities: string[] }).targetEntities) expect(new URL(e).host).toBe(new URL(r.url).host);
    expect(v.tagReads.flatMap((r) => (JSON.parse(r.body!) as { targetEntities: string[] }).targetEntities).sort()).toEqual([FAR, entityUriOf("nv1")].sort());
    expect(v.created).toEqual([]);
  });

  test("the fake vault answers a record's main tag at that record's own host only (so a request sent to another host finds no tag)", async () => {
    const v = vault();
    const ask = async (origin: string, e: string) =>
      ((await (await v.fetch(`${origin}/base/tag/masters`, { method: "POST", body: JSON.stringify({ vault: `${origin}/base`, targetEntities: [e] }) })).json()) as { masterTags: { tagKnown: boolean; tagString: string | null }[] }).masterTags[0];
    expect(await ask("https://vedas.example.test", FAR)).toMatchObject({ tagKnown: true, tagString: "Far.Main" });
    expect(await ask("https://platform.example.test", FAR)).toMatchObject({ tagKnown: false, tagString: null });
    expect(await ask("https://vedas.example.test", entityUriOf("nv1"))).toMatchObject({ tagKnown: false, tagString: null });
    expect(v.requests("POST", /./)).toHaveLength(0);
  });

  test("StakeholderLinesHost.useMainTag answers { known, tag } of the record, and { known: false } of a record the platform has no tag for", async () => {
    const v = vault();
    const { hosts, wrapper } = hostsOn(v);
    const { result } = renderHook(() => ({ a: hosts.stakeholderLines.useMainTag(entityUriOf("nv1")), b: hosts.stakeholderLines.useMainTag(entityUriOf("nothing")), c: hosts.stakeholderLines.useMainTag(null) }), { wrapper });
    await waitFor(() => expect(result.current.a.data).toEqual({ tag: "Speed.Main", known: true }));
    await waitFor(() => expect(result.current.b.data).toEqual({ tag: null, known: false }));
    expect(result.current.c.data).toBeUndefined();
    expect(v.tagReads).toHaveLength(2);
    for (const r of v.tagReads) {
      expect(r.url).toBe("https://platform.example.test/base/tag/masters");
      expect((JSON.parse(r.body!) as { targetEntities: string[] }).targetEntities).toHaveLength(1);
    }
  });
});

describe("a context left out still names itself", () => {
  test("a card drawn with the hosts but without the Value write context fails by naming it", () => {
    applyPlatformSetup({ origin: ORIGIN, ontologyOrigin: ONTOLOGY, systemVaultHosts: SYSTEM_VAULT_HOSTS, systemHostLabels: ["id"] });
    const qc = new QueryClient();
    const hosts = createPlanCardHosts({ qc, useShell: () => ({ vaults: [] }), useSelfSource: () => null, ontologyOrigin: ONTOLOGY });
    const vault = smallVault();
    vi.stubGlobal("fetch", vault.fetch);
    const fail = vi.spyOn(console, "error").mockImplementation(() => {});
    const card = (
      <QueryClientProvider client={qc}>
        <PlanSourceHostContext.Provider value={hosts.planSource}>
          <RefLabelContext.Provider value={hosts.refLabel}>
            <PickerQueryContext.Provider value={hosts.pickerQuery}>
              <ValueLinesHostContext.Provider value={hosts.valueLines}>
                <StakeholderLinesHostContext.Provider value={hosts.stakeholderLines}>
                  <PlanTagLinksHostContext.Provider value={hosts.planTagLinks}>
                    <PlanTagPickerHostContext.Provider value={hosts.planTagPicker}>
                      <PlanImpactsHostContext.Provider value={hosts.planImpacts}>
                        <DescriptionPartsHostContext.Provider value={hosts.descriptionParts}>
                          <ProjectLevelsHostContext.Provider value={hosts.projectLevels}>
                            <TermDefinitionContext.Provider value={hosts.termDefinition}>
                              <TypePictureSourceContext.Provider value={hosts.typePicture}>
                                <PlanCardHostContext.Provider value={hosts.planCard}>
                                  <CardModeProvider canEdit>
                                    <Screen Card={ValueCard} vault={vault} id="val1" />
                                  </CardModeProvider>
                                </PlanCardHostContext.Provider>
                              </TypePictureSourceContext.Provider>
                            </TermDefinitionContext.Provider>
                          </ProjectLevelsHostContext.Provider>
                        </DescriptionPartsHostContext.Provider>
                      </PlanImpactsHostContext.Provider>
                    </PlanTagPickerHostContext.Provider>
                  </PlanTagLinksHostContext.Provider>
                </StakeholderLinesHostContext.Provider>
              </ValueLinesHostContext.Provider>
            </PickerQueryContext.Provider>
          </RefLabelContext.Provider>
        </PlanSourceHostContext.Provider>
      </QueryClientProvider>
    );
    expect(() => render(card)).toThrow(/ValueWriteHostContext/);
    fail.mockRestore();
  });
});
