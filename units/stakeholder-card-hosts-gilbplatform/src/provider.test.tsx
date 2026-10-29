// The provider: what it sets and when, what it mounts, what stays the same object, and what each optional prop turns on or off.
import { useContext } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { baseOrigin, localRigHosts, minOntologyQuery, ontologyApiOrigin, publicCorpusOrigin, systemVaultHosts, vocabTypeBatchRevisions } from "@kaigilb/gilbplatformcode-base-origin";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { systemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { dpopReadAuth, dpopWriteAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { typeKey } from "@kaigilb/gilbplatformcode-type-key";
import { typeFacetKey } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { OnlineStakeholderCardHostContext, type OnlineStakeholderCardShell } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderContactHeaderHostContext } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { OneCardHostContext } from "@kaigilb/gilbplatformcode-one-card";
import { STAKEHOLDER_CARD_QUERY_DEFAULTS } from "./index";
import { __resetPhotoTermResolvers } from "./photoTerm";
import { BASE, GEO, HOST, ONTOLOGY, P, P_ENTITY, SYSTEM_HOSTS, createWorld, type World } from "../test/world";
import { mountInProvider, newClient, providerProps } from "../test/harness";

let world: World;
beforeEach(async () => {
  world = await createWorld();
  vi.stubGlobal("fetch", world.fetch);
});

function useAll() {
  return {
    card: useContext(OnlineStakeholderCardHostContext),
    header: useContext(StakeholderContactHeaderHostContext),
    oneCard: useContext(OneCardHostContext),
  };
}
type All = ReturnType<typeof useAll>;
function probe(into: All[]) {
  return function Probe() {
    into.push(useAll());
    return null;
  };
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
        registryKey: typeKey("t:FunctionConstraint"),
      });
      return null;
    }
    mountInProvider(world, <First />);
    expect(seen[0]).toEqual({
      origin: BASE,
      ontology: ONTOLOGY,
      hosts: SYSTEM_HOSTS,
      labels: ["id", "ontology"],
      key: typeFacetKey("t:Value"),
      registryKey: "functionConstraint",
    });
  });

  test("the session the provider was given signs a write for the platform, and nothing for a host outside it", async () => {
    mountInProvider(world, null);
    const pair = await dpopWriteAuth("PATCH", `${HOST}/lws/r/x`);
    expect(pair).toEqual({ authorization: "DPoP fake-access-token", dpop: `proof(PATCH ${HOST}/lws/r/x)` });
    expect(await dpopReadAuth("GET", "https://evil.example.org/lws/r/x")).toEqual({});
    expect(world.signed).toEqual([{ method: "PATCH", url: `${HOST}/lws/r/x` }]);
  });

  test("the optional settings are set when given and left at the defaults when not", () => {
    mountInProvider(world, null);
    expect([minOntologyQuery(), [...localRigHosts()], ontologyApiOrigin(), vocabTypeBatchRevisions()]).toEqual([3, [], undefined, undefined]);
    expect(() => publicCorpusOrigin()).toThrow(/setPublicCorpusOrigin/);
  });

  test("every optional setting given is set", () => {
    mountInProvider(world, null, {
      settings: { localRigHosts: ["localhost"], minOntologyQuery: 5, ontologyApiOrigin: "https://api.example.test", vocabTypeBatchRevisions: "abc,def", publicCorpusOrigin: "https://corpus.example.test" },
    });
    expect([minOntologyQuery(), [...localRigHosts()], ontologyApiOrigin(), vocabTypeBatchRevisions(), publicCorpusOrigin()]).toEqual([
      5,
      ["localhost"],
      "https://api.example.test",
      "abc,def",
      "https://corpus.example.test",
    ]);
  });

  describe("the order: the first setter that refuses is the one that speaks", () => {
    const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
    test("the origin before the ontology origin", () => {
      const q = quiet();
      expect(() => mountInProvider(world, null, { origin: "no origin", ontologyOrigin: "no origin either" })).toThrow(/setBaseOrigin/);
      q.mockRestore();
    });
    test("the ontology origin before the system hosts", () => {
      const q = quiet();
      expect(() => mountInProvider(world, null, { ontologyOrigin: "no origin", systemVaultHosts: ["not a host!"] })).toThrow(/term-origin/);
      q.mockRestore();
    });
    test("the system hosts before the host labels", () => {
      const q = quiet();
      expect(() => mountInProvider(world, null, { systemVaultHosts: ["not a host!"], systemHostLabels: ["a.b"] })).toThrow(/setSystemVaultHosts/);
      q.mockRestore();
    });
    test("the host labels before the optional settings", () => {
      const q = quiet();
      expect(() => mountInProvider(world, null, { systemHostLabels: ["a.b"], settings: { ontologyApiOrigin: "no origin" } })).toThrow(/setSystemHostLabels/);
      q.mockRestore();
    });
    test("the settings are set in the render, so a child that throws without them is never reached", () => {
      const q = quiet();
      expect(() => mountInProvider(world, <Boom />)).not.toThrow();
      q.mockRestore();
    });
  });

  test("a changed optional setting is set on a re-render, and a changed session is set", async () => {
    const view = mountInProvider(world, null);
    expect(minOntologyQuery()).toBe(3);
    view.rerenderWith(null, { settings: { minOntologyQuery: 7 } });
    expect(minOntologyQuery()).toBe(7);
    const second = await createWorld();
    view.rerenderWith(null, { session: second.session });
    await dpopReadAuth("GET", `${HOST}/lws/r/y`);
    expect(second.signed).toEqual([{ method: "GET", url: `${HOST}/lws/r/y` }]);
    expect(world.signed).toEqual([]);
  });

  test("a re-render with the same values sets nothing again, and a changed origin is set", () => {
    const view = mountInProvider(world, null);
    expect(baseOrigin()).toBe(BASE);
    view.rerenderWith(null, { origin: "https://other.example.test" });
    expect(baseOrigin()).toBe("https://other.example.test");
  });
});

function Boom() {
  baseOrigin();
  termOrigin();
  return null;
}

describe("what it mounts", () => {
  test("the three contexts are filled, each with the members of its interface", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    mountInProvider(world, <Probe />);
    const at = seen[seen.length - 1]!;
    expect(Object.keys(at.card!).sort()).toEqual(["doors", "person", "photoReadKeysSync", "refreshOnlineStakeholders", "useShell", "vocabulary"]);
    expect(Object.keys(at.card!.doors).sort()).toEqual(["heldRecordFreshMs", "heldRecordOf", "requestsSent", "useRecordsBeingDeleted"]);
    expect(Object.keys(at.card!.person).sort()).toEqual(["adderCardOf", "rememberCreatedIn"]);
    expect(Object.keys(at.card!.vocabulary)).toEqual(["masterKindReader"]);
    expect(Object.keys(at.header!).sort()).toEqual(["discoverVaultProfilePhoto", "loadGranteeFace", "loadPhotoObjectUrl", "useContactLabels", "useHolderOriginLine", "useRelations"]);
    expect(Object.keys(at.oneCard!).sort()).toEqual(["claimFieldText", "claimsAbout", "isGeoEntityId", "listPlaceClaimsInVault", "loadPlaceNames", "placeClaimsKey", "placeClaimsStaleMs"]);
  });

  test("it makes a query client with the app's defaults, and uses a given one as it is", () => {
    let own: QueryClient | null = null;
    function Take() {
      own = useQueryClient();
      return null;
    }
    mountInProvider(world, <Take />);
    expect(own!.getDefaultOptions().queries).toEqual({ staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 });
    expect(STAKEHOLDER_CARD_QUERY_DEFAULTS).toEqual({ staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 });
    const mine = new QueryClient({ defaultOptions: { queries: { staleTime: 1 } } });
    mountInProvider(world, <Take />, { queryClient: mine });
    expect(own).toBe(mine);
    expect(mine.getDefaultOptions().queries).toEqual({ staleTime: 1 });
  });

  test("the hosts are the same objects across re-renders with new props, and the callbacks they hold are the latest", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    const first = vi.fn();
    const second = vi.fn();
    const view = mountInProvider(world, <Probe />, { refreshOnlineStakeholders: first });
    const before = seen[seen.length - 1]!;
    view.rerenderWith(<Probe />, { refreshOnlineStakeholders: second });
    const after = seen[seen.length - 1]!;
    for (const name of Object.keys(before) as (keyof All)[]) expect(after[name], name).toBe(before[name]);
    after.card!.refreshOnlineStakeholders();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("a function member the developer gave is called with the latest one, and the default stands when it goes", async () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    const a = vi.fn(async () => ({ photoRef: "a" }));
    const b = vi.fn(async () => ({ photoRef: "b" }));
    const view = mountInProvider(world, <Probe />, { discoverVaultProfilePhoto: a });
    const header = seen[seen.length - 1]!.header!;
    expect(await header.discoverVaultProfilePhoto(null)).toEqual({ photoRef: "a" });
    view.rerenderWith(<Probe />, { discoverVaultProfilePhoto: b });
    expect(await header.discoverVaultProfilePhoto(null)).toEqual({ photoRef: "b" });
    view.rerenderWith(<Probe />, { discoverVaultProfilePhoto: undefined });
    expect(await header.discoverVaultProfilePhoto(null)).toEqual({ photoRef: null });
    expect(a).toHaveBeenCalledTimes(1);
  });

  test("the isGeoEntityId of the one card follows the geoOrigin prop", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    mountInProvider(world, <Probe />, { geoOrigin: `${GEO}/` });
    const geo = seen[seen.length - 1]!.oneCard!.isGeoEntityId;
    expect(geo(`${GEO}/base/e/paris`)).toBe(true);
    expect(geo(`${GEO}/base/t/Place`)).toBe(false);
    expect(geo("https://elsewhere.example.org/base/e/paris")).toBe(false);
    expect(geo(42)).toBe(false);
  });

  test("persistVocabulary is passed through when given and absent when not", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    mountInProvider(world, <Probe />);
    expect("persistVocabulary" in seen[seen.length - 1]!.card!.vocabulary).toBe(false);
    __resetPhotoTermResolvers();
    const persist = vi.fn(() => false);
    mountInProvider(world, <Probe />, { persistVocabulary: persist });
    expect(seen[seen.length - 1]!.card!.vocabulary.persistVocabulary!()).toBe(false);
    expect(persist).toHaveBeenCalled();
  });
});

describe("the shell from the session", () => {
  function shellOf(into: OnlineStakeholderCardShell[]) {
    return function Shell() {
      const host = useContext(OnlineStakeholderCardHostContext)!;
      into.push(host.useShell());
      return null;
    };
  }

  test("the session is the credential's; the vaults are the session's set, decorated by the platform's list, landing flag included", async () => {
    const seen: OnlineStakeholderCardShell[] = [];
    const Shell = shellOf(seen);
    mountInProvider(world, <Shell />);
    expect(seen[0]!.session).toBeUndefined();
    await waitFor(() => expect(seen[seen.length - 1]!.vaults[0]?.isLandingVault).toBe(true));
    const shell = seen[seen.length - 1]!;
    expect(shell.session).toEqual({ principal: "https://id.example.test/base/p/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", vault: { entity: P_ENTITY } });
    expect(shell.vaults).toEqual([
      expect.objectContaining({ vaultId: P, entity: P_ENTITY, name: "Ann", modes: ["read", "write"], isLandingVault: true }),
    ]);
  });

  test("while the decoration is out the rows are lean: the session's id and modes, no entity, not landing", async () => {
    const seen: OnlineStakeholderCardShell[] = [];
    const Shell = shellOf(seen);
    mountInProvider(world, <Shell />);
    await waitFor(() => expect(seen[seen.length - 1]!.session).toBeDefined());
    const lean = seen.find((s) => s.session && s.vaults.length > 0 && !s.vaults[0]!.isLandingVault);
    expect(lean?.vaults[0]).toMatchObject({ vaultId: P, entity: null, name: null, modes: ["read", "write"], isLandingVault: false, shortNameKnown: false });
  });

  test("the vault list is read under GilbApp's own key, and once", async () => {
    const seen: OnlineStakeholderCardShell[] = [];
    const Shell = shellOf(seen);
    const qc = newClient();
    mountInProvider(world, <Shell />, { queryClient: qc });
    await waitFor(() => expect(qc.getQueryData(["base", "vaults", "https://id.example.test/base/p/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])).toHaveLength(1));
    expect(world.requests("GET", /\/lws\/vaults$/).length).toBe(1);
  });

  test("the content scope names the vault being viewed and no reach; the card reads the landing row instead", async () => {
    const seen: OnlineStakeholderCardShell[] = [];
    const Shell = shellOf(seen);
    const view = mountInProvider(world, <Shell />, { viewedVaultId: P });
    await waitFor(() => expect(seen[seen.length - 1]!.session).toBeDefined());
    expect(seen[seen.length - 1]!.contentScope).toEqual({ readVaultId: P, reach: null });
    view.rerenderWith(<Shell />, { viewedVaultId: "https://holder.example.test/base/pother" });
    expect(seen[seen.length - 1]!.contentScope).toEqual({ readVaultId: "https://holder.example.test/base/pother", reach: null });
    view.rerenderWith(<Shell />, { viewedVaultId: undefined });
    expect(seen[seen.length - 1]!.contentScope).toEqual({ readVaultId: null, reach: null });
  });

  test("openRecordFromList calls the latest onOpenRecord, and nothing when there is none", async () => {
    const seen: OnlineStakeholderCardShell[] = [];
    const Shell = shellOf(seen);
    const first = vi.fn();
    const second = vi.fn();
    const view = mountInProvider(world, <Shell />, { onOpenRecord: first });
    seen[seen.length - 1]!.openRecordFromList("a");
    view.rerenderWith(<Shell />, { onOpenRecord: second });
    seen[seen.length - 1]!.openRecordFromList("b");
    view.rerenderWith(<Shell />, { onOpenRecord: undefined });
    expect(() => seen[seen.length - 1]!.openRecordFromList("c")).not.toThrow();
    expect(first.mock.calls).toEqual([["a"]]);
    expect(second.mock.calls).toEqual([["b"]]);
  });

  test("the shell keeps its identity across renders while nothing it holds changes", async () => {
    const seen: OnlineStakeholderCardShell[] = [];
    const Shell = shellOf(seen);
    const view = mountInProvider(world, <Shell />);
    await waitFor(() => expect(seen[seen.length - 1]!.vaults[0]?.isLandingVault).toBe(true));
    const a = seen[seen.length - 1]!;
    await act(async () => view.rerenderWith(<Shell />));
    expect(seen[seen.length - 1]).toBe(a);
  });
});

describe("the photo term", () => {
  const ask = () => world.requests("GET", /\/base\/a\/profilePhoto$/);

  test("it is asked once when the provider mounts, at the provider's origin", async () => {
    mountInProvider(world, null);
    await waitFor(() => expect(ask().length).toBe(1));
    expect(ask()[0]!.url).toBe(`${BASE}/base/a/profilePhoto`);
  });

  test("the read keys are the seed until the master answers, then the master's", async () => {
    const answered = await createWorld({ photoTerm: "a:avatarImage" });
    vi.stubGlobal("fetch", answered.fetch);
    const seen: All[] = [];
    const Probe = probe(seen);
    mountInProvider(answered, <Probe />);
    const keys = seen[seen.length - 1]!.card!.photoReadKeysSync;
    expect(keys().length).toBeGreaterThan(0);
    expect(keys()).not.toContain("a:avatarImage");
    await waitFor(() => expect(keys()).toContain("a:avatarImage"));
  });

  test("a master that does not answer leaves the seed: the keys are never empty by that", async () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    mountInProvider(world, <Probe />);
    await waitFor(() => expect(world.requests("GET", /profilePhoto$/).length).toBe(1));
    expect(seen[seen.length - 1]!.card!.photoReadKeysSync().length).toBeGreaterThan(0);
  });
});

describe("the required props", () => {
  test("providerProps names every required prop", () => {
    expect(Object.keys(providerProps(world)).sort()).toEqual(["geoOrigin", "ontologyOrigin", "origin", "session", "systemHostLabels", "systemVaultHosts"]);
  });
});

describe("a changed geoOrigin", () => {
  test("the one-card host is rebuilt over the NEW geoOrigin, not the first one", () => {
    const seen: All[] = [];
    const Probe = probe(seen);
    const view = mountInProvider(world, <Probe />);
    const first = seen.at(-1)!.oneCard!;
    expect(first.isGeoEntityId(GEO + "/base/e/x")).toBe(true);
    view.rerenderWith(<Probe />, { geoOrigin: "https://elsewhere.example" });
    const next = seen.at(-1)!.oneCard!;
    expect(next).not.toBe(first);
    expect(next.isGeoEntityId("https://elsewhere.example/base/e/x")).toBe(true);
    expect(next.isGeoEntityId(GEO + "/base/e/x")).toBe(false);
  });
});
