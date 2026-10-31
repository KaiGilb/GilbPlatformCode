// What the provider mounts for the held card since 0.4.0: the label hook, the hosts of the card's peers, the profile address setting, and the ring of
// replaced inline copies (each one a unit's now).
import { useContext } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { RefLabelContext, refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { AdderCardHostContext } from "@kaigilb/gilbplatformcode-adder-card";
import { AddedByHostContext } from "@kaigilb/gilbplatformcode-added-by";
import { OtherLinkedRecordsHostContext } from "@kaigilb/gilbplatformcode-other-linked-records";
import { ContactRowsHostContext } from "@kaigilb/gilbplatformcode-contact-rows";
import { useStakeholderSetFieldsHost } from "@kaigilb/gilbplatformcode-stakeholder-set-fields";
import { useHomeDial } from "@kaigilb/gilbplatformcode-home-dial";
import { noteServedVersion, saveRecordSidecar } from "@kaigilb/gilbplatformcode-record-sidecar-save";
import { myNetProfileUrl, resetMyNetProfileUrl } from "@kaigilb/gilbplatformcode-own-card-state";
import { changeRecordFactItems } from "@kaigilb/gilbplatformcode-record-fact-items";
import { useHolderOriginLine } from "@kaigilb/gilbplatformcode-contact-card-slots";
import { useContactLabels } from "@kaigilb/gilbplatformcode-contact-labels";
import { StakeholderContactHeaderHostContext } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { rememberCreatedIn } from "@kaigilb/gilbplatformcode-record-detail-reads";
import { QueryClient } from "@tanstack/react-query";
import { StakeholderCardPlatformContext, useStakeholderCardPlatform } from "./platform";
import { useRefLabel } from "./refLabel";
import { HOST, P, createWorld, type World } from "../test/world";
import { mountInProvider } from "../test/harness";

let world: World;
beforeEach(async () => {
  world = await createWorld();
  vi.stubGlobal("fetch", world.fetch);
});

function Probe({ into }: { into: Record<string, unknown>[] }) {
  into.push({
    refLabel: useContext(RefLabelContext),
    adder: useContext(AdderCardHostContext),
    addedBy: useContext(AddedByHostContext),
    other: useContext(OtherLinkedRecordsHostContext),
    rows: useContext(ContactRowsHostContext),
    setFields: useStakeholderSetFieldsHost(),
  });
  return null;
}

describe("the hosts of the held card's peers", () => {
  test("every one is mounted, with the members its unit reads", () => {
    const seen: Record<string, any>[] = [];
    mountInProvider(world, <Probe into={seen} />);
    const at = seen[seen.length - 1]!;
    expect(at.refLabel).toBe(useRefLabel);
    expect(Object.keys(at.adder).sort()).toEqual(["useSession"]);
    expect(Object.keys(at.addedBy).sort()).toEqual(["useShell"]);
    expect(Object.keys(at.other).sort()).toEqual(["useShell"]);
    expect(at.setFields.changeRecordFactItems).toBe(changeRecordFactItems);
    expect(Object.keys(at.rows).sort()).toEqual(["AddedByLine", "HeldVisibilitySwitch", "PhoneValue", "SkillDepthNote", "SkillPickerSheet", "SocialLogo", "noteServedVersion", "saveRecordSidecar", "socialPlatformName", "useHomeDial"]);
    expect(at.rows.useHomeDial).toBe(useHomeDial);
    expect(at.rows.saveRecordSidecar).toBe(saveRecordSidecar);
    expect(at.rows.noteServedVersion).toBe(noteServedVersion);
  });

  test("the hosts are the same objects across re-renders", () => {
    const seen: Record<string, any>[] = [];
    const view = mountInProvider(world, <Probe into={seen} />);
    const before = seen[seen.length - 1]!;
    view.rerenderWith(<Probe into={seen} />, { onOpenRecord: () => {} });
    const after = seen[seen.length - 1]!;
    for (const k of Object.keys(before)) expect(after[k], k).toBe(before[k]);
  });

  test("the adder's card reads the session passively: it sees the principal once the shell holds the session, and fetches nothing itself", async () => {
    const seen: Record<string, any>[] = [];
    function Both() {
      const adder = useContext(AdderCardHostContext)!;
      const passive = adder.useSession({ enabled: false });
      seen.push({ passive: passive.data?.principal ?? null });
      return null;
    }
    const read = vi.spyOn(world.session, "getSession");
    mountInProvider(world, <Both />);
    await new Promise((r) => setTimeout(r, 50));
    expect(seen[seen.length - 1]!.passive).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  test("the other-linked list's shell is the vault list; the Added-by line opens a record by the page's onOpenRecord", async () => {
    const opened: unknown[][] = [];
    const seen: Record<string, any>[] = [];
    function Both() {
      const other = useContext(OtherLinkedRecordsHostContext)!;
      const addedBy = useContext(AddedByHostContext)!;
      seen.push({ vaults: other.useShell().vaults, shell: addedBy.useShell() });
      return null;
    }
    mountInProvider(world, <Both />, { onOpenRecord: (...a) => void opened.push(a) });
    await waitFor(() => expect(seen[seen.length - 1]!.vaults?.[0]?.isLandingVault).toBe(true));
    seen[seen.length - 1]!.shell.openRecordFromList("abc");
    expect(opened).toEqual([["abc"]]);
  });
});

describe("useRefLabel", () => {
  test("a record in the loaded list is named by its name, with no read", async () => {
    const uri = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen" });
    const id = uri.slice(uri.lastIndexOf("/") + 1);
    let label: string | null = "unset";
    function Reader() {
      label = useRefLabel({ id, uri }, P);
      return null;
    }
    mountInProvider(world, <Reader />, { viewedVaultId: P });
    await waitFor(() => expect(label).toBe("Ben Larsen"));
  });

  test("a record that is not in the list is read once, at its own node, and named by its name; while it is read the label is null", async () => {
    const uri = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen" });
    const id = uri.slice(uri.lastIndexOf("/") + 1);
    const seen: (string | null)[] = [];
    function Reader() {
      seen.push(useRefLabel({ id, uri }, "https://holder.example.test/base/pnone"));
      return null;
    }
    mountInProvider(world, <Reader />);
    expect(seen[0]).toBeNull();
    await waitFor(() => expect(seen[seen.length - 1]).toBe("Ben Larsen"));
    expect(world.requests("GET", new RegExp(`/lws/r/${id}$`)).length).toBe(1);
  });

  test("a record the store does not return is named by its address, not left waiting and not blank", async () => {
    const uri = `${HOST}/base/e/nonesuch`;
    const seen: (string | null)[] = [];
    function Reader() {
      seen.push(useRefLabel({ id: "nonesuch", uri }, "https://holder.example.test/base/pnone"));
      return null;
    }
    mountInProvider(world, <Reader />);
    await waitFor(() => expect(seen[seen.length - 1]).toBe(refDisplayName(null, uri)));
    expect(refDisplayName(null, uri)).toBeTruthy();
  });

  test("no address: no label, and no read of any record", async () => {
    let label: string | null = "unset";
    function Reader() {
      label = useRefLabel(null, P);
      return null;
    }
    mountInProvider(world, <Reader />);
    await new Promise((r) => setTimeout(r, 50));
    expect(label).toBeNull();
    expect(world.requests("GET", /\/lws\/r\//)).toEqual([]);
  });
});

describe("the profile address setting", () => {
  test("mynetProfileUrl is set for the own-card band when given", () => {
    mountInProvider(world, null, { settings: { mynetProfileUrl: "https://mynet.example.test/profile" } });
    expect(myNetProfileUrl()).toBe("https://mynet.example.test/profile");
  });

  test("absent, none is set: the unit's own error names the setter", () => {
    resetMyNetProfileUrl();
    mountInProvider(world, null);
    expect(() => myNetProfileUrl()).toThrow(/setMyNetProfileUrl/);
  });

  test("an address that is not an http(s) address is refused at mount, with the unit's error", () => {
    expect(() => mountInProvider(world, null, { settings: { mynetProfileUrl: "javascript:alert(1)" } })).toThrow(/own-card-state/);
  });
});

describe("what the host unit of the held card reads from the provider", () => {
  function Platform({ into }: { into: unknown[] }) {
    into.push(useContext(StakeholderCardPlatformContext));
    return null;
  }

  test("the platform context holds the shell hook, both photo-key readers and the label hook; persistVocabulary only when given", () => {
    const seen: Record<string, unknown>[] = [];
    const view = mountInProvider(world, <Platform into={seen} />);
    expect(Object.keys(seen[seen.length - 1]!).sort()).toEqual(["photoReadKeys", "photoReadKeysSync", "useRefLabel", "useShell"]);
    expect((seen[seen.length - 1] as { useRefLabel: unknown }).useRefLabel).toBe(useRefLabel);
    view.unmount();
    const withIt: Record<string, unknown>[] = [];
    mountInProvider(world, <Platform into={withIt} />, { persistVocabulary: () => false });
    expect((withIt[withIt.length - 1] as { persistVocabulary(): boolean }).persistVocabulary()).toBe(false);
  });

  test("photoReadKeys resolves the photo term's keys once the master answers; photoReadKeysSync has them then", async () => {
    const answered = await createWorld({ photoTerm: "a:avatarImage" });
    vi.stubGlobal("fetch", answered.fetch);
    const seen: unknown[] = [];
    mountInProvider(answered, <Platform into={seen} />);
    const host = seen[seen.length - 1] as { photoReadKeys(): Promise<readonly string[]>; photoReadKeysSync(): readonly string[] };
    expect(await host.photoReadKeys()).toContain("a:avatarImage");
    expect(host.photoReadKeysSync()).toContain("a:avatarImage");
  });

  test("without the provider the hook throws an error that names it", () => {
    function Bare() {
      useStakeholderCardPlatform();
      return null;
    }
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/StakeholderCardGilbPlatformProvider/);
    quiet.mockRestore();
  });

  test("the header's useHolderOriginLine and useContactLabels are the ones of contact-card-slots and contact-labels (one instance, shared with the held card's slots)", () => {
    function Header() {
      const h = useContext(StakeholderContactHeaderHostContext)!;
      return <>{JSON.stringify([h.useHolderOriginLine === useHolderOriginLine, h.useContactLabels === useContactLabels])}</>;
    }
    const view = mountInProvider(world, <Header />);
    expect(view.container.textContent).toBe("[true,true]");
  });

  test("a record a create of this session wrote into a vault is opened with that vault as its door; a record whose vault is not known is opened by id alone", () => {
    const opened: unknown[][] = [];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shells: { openRecordFromList(id: string): void }[] = [];
    function Shell() {
      shells.push(useStakeholderCardPlatform().useShell());
      return null;
    }
    mountInProvider(world, <Shell />, { queryClient: qc, onOpenRecord: (...a) => void opened.push(a) });
    rememberCreatedIn(qc, "r1", P);
    shells[shells.length - 1]!.openRecordFromList("r1");
    shells[shells.length - 1]!.openRecordFromList("r2");
    expect(opened).toEqual([["r1", P], ["r2"]]);
  });
});
