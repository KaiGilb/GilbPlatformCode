// The host this unit builds for the held card: its members are the provider's pieces, and nothing else is given.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
import { useStakeholderCardPlatform, type StakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { Fragment } from "react";
import { InterestRows } from "@kaigilb/gilbplatformcode-interest-rows";
import { EmploymentRows } from "@kaigilb/gilbplatformcode-employment-rows";
import { LanguageSection } from "@kaigilb/gilbplatformcode-language-section";
import { findOrganizationRecords } from "@kaigilb/gilbplatformcode-org-hierarchy";
import { SkillRows } from "@kaigilb/gilbplatformcode-skill-rows";
import { WorkLocationField } from "@kaigilb/gilbplatformcode-work-location-field";
import { WorkPlaceName } from "@kaigilb/gilbplatformcode-work-place-name";
import { resetGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { createStakeholderRecordCardHost } from "./index";
import { GEO, P, createWorld, type World } from "../test/world";
import { mountInProvider } from "../test/harness";

// The probe: the props `EmploymentRows` is given. The section itself is proved end to end in `heldCard.employment.test.tsx`.
const seenRows: Record<string, unknown>[] = [];
vi.mock("@kaigilb/gilbplatformcode-employment-rows", () => ({
  EmploymentRows: (props: Record<string, unknown>) => {
    seenRows.push(props);
    return null;
  },
}));

// The probe: the props `AddressRows` is given. The section is proved end to end in `heldCard.address.test.tsx`.
const seenAddress: Record<string, unknown>[] = [];
vi.mock("@kaigilb/gilbplatformcode-address-rows", () => ({
  AddressRows: (props: Record<string, unknown>) => {
    seenAddress.push(props);
    return null;
  },
}));

let world: World;
beforeEach(async () => {
  world = await createWorld();
  vi.stubGlobal("fetch", world.fetch);
});

function platformOf(over: Parameters<typeof mountInProvider>[2] = {}): StakeholderCardPlatform {
  const seen: StakeholderCardPlatform[] = [];
  function Probe() {
    seen.push(useStakeholderCardPlatform());
    return null;
  }
  mountInProvider(world, <Probe />, over);
  return seen[seen.length - 1]!;
}

describe("createStakeholderRecordCardHost", () => {
  test("the shell, both photo-key readers and the label hook are the provider's; the vocabulary host has the master's kind reader", () => {
    const platform = platformOf();
    const host = createStakeholderRecordCardHost(platform);
    expect(Object.keys(host).sort()).toEqual(["photoReadKeys", "photoReadKeysSync", "renderAddress", "renderEmployment", "renderLanguages", "renderSkillsAndInterests", "useRefLabel", "useShell", "vocabulary"]);
    expect(host.useShell).toBe(platform.useShell);
    expect(host.photoReadKeys).toBe(platform.photoReadKeys);
    expect(host.photoReadKeysSync).toBe(platform.photoReadKeysSync);
    expect(host.useRefLabel).toBe(platform.useRefLabel);
    expect(Object.keys(host.vocabulary)).toEqual(["masterKindReader"]);
  });

  test("the provider's persistVocabulary is passed to the vocabulary host when given, and left out when not", () => {
    const given = createStakeholderRecordCardHost(platformOf({ persistVocabulary: () => false }));
    expect(given.vocabulary.persistVocabulary!()).toBe(false);
    expect("persistVocabulary" in createStakeholderRecordCardHost(platformOf()).vocabulary).toBe(false);
  });

  test("the optional pieces of the card are not given", () => {
    const host = createStakeholderRecordCardHost(platformOf()) as unknown as Record<string, unknown>;
    for (const k of ["holdingVaultOf", "renderRecordPicture", "renderBandIcon", "renderTypeDescription", "renderAttachments"]) expect(k in host).toBe(false);
  });

  test("0.6.0: renderAddress is the host's Address component, which gives AddressRows the slot's props as they are (the vault is the RECORD's, never the viewer's) and the vault's name when the shell lists it", async () => {
    const host = createStakeholderRecordCardHost(platformOf());
    const slotProps = { title: "Postal Address", legacyText: "Storgata 9", vaultId: P, recordEntityUri: `${P}/e/r1`, principal: "https://id.example.test/base/p/x", canEdit: true };
    const el = host.renderAddress!(slotProps) as unknown as { type: unknown; props: Record<string, unknown> };
    expect(typeof el.type).toBe("function");
    expect(el.props).toEqual(slotProps);
    seenAddress.length = 0;
    mountInProvider(world, host.renderAddress!(slotProps), { viewedVaultId: "https://viewer.example.test/base/pviewer" });
    await waitFor(() => expect(seenAddress[seenAddress.length - 1]?.vaultName).toBe("Ann"));
    const given = seenAddress[seenAddress.length - 1]!;
    expect(Object.keys(given).sort()).toEqual([...Object.keys(slotProps), "vaultName"].sort());
    // M36: the vault is the one the slot named, whatever vault the viewer is looking at.
    expect(given.vaultId).toBe(P);
    expect(given.recordEntityUri).toBe(slotProps.recordEntityUri);
    expect(given.canEdit).toBe(true);
    // a vault the shell does not list: no name is given (the group then says "this vault")
    cleanup();
    seenAddress.length = 0;
    mountInProvider(world, host.renderAddress!({ ...slotProps, vaultId: "https://elsewhere.example.test/base/pnone" }));
    await waitFor(() => expect(seenAddress.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));
    expect(seenAddress.every((g) => !("vaultName" in g))).toBe(true);
  });

  test("0.2.0: renderLanguages draws the Languages section with the slot's props as they are, and gives it NO country search", () => {
    const host = createStakeholderRecordCardHost(platformOf());
    const slotProps = { vaultId: "https://holder.example.test/base/pann", principal: "https://id.example.test/base/p/x", recordEntityUri: "https://holder.example.test/base/e/r1", canEdit: true, contactTag: "no", writeContact: () => undefined };
    const el = host.renderLanguages!(slotProps) as unknown as { type: unknown; props: Record<string, unknown> };
    expect(el.type).toBe(LanguageSection);
    expect(el.props).toEqual(slotProps);
    expect("renderCountrySearch" in el.props).toBe(false);
    expect(el.props.writeContact).toBe(slotProps.writeContact);
    const none = host.renderLanguages!({ ...slotProps, writeContact: null, canEdit: false }) as unknown as { props: Record<string, unknown> };
    expect(none.props.writeContact).toBeNull();
    expect(none.props.canEdit).toBe(false);
  });

  test("0.3.0: renderSkillsAndInterests draws SkillRows then InterestRows, each with its half of the slot's props as they are, and nothing else", () => {
    const host = createStakeholderRecordCardHost(platformOf());
    const skills = { vaultId: "https://holder.example.test/base/pann", principal: "https://id.example.test/base/p/x", recordId: "r1", recordEntityUri: "https://holder.example.test/base/e/r1", title: "Skills", valueKey: "skill", metaKey: "fieldMeta", etag: "e1", served: { values: [], meta: {} }, canEdit: true, onSaved: () => undefined };
    const interests = { vaultId: "https://holder.example.test/base/pann", principal: "https://id.example.test/base/p/x", recordEntityUri: "https://holder.example.test/base/e/r1", canEdit: true };
    const el = host.renderSkillsAndInterests!({ skills, interests }) as unknown as { type: unknown; props: { children: { type: unknown; props: Record<string, unknown> }[] } };
    expect(el.type).toBe(Fragment);
    expect(el.props.children).toHaveLength(2);
    expect(el.props.children[0]!.type).toBe(SkillRows);
    expect(el.props.children[0]!.props).toEqual(skills);
    expect(el.props.children[0]!.props.onSaved).toBe(skills.onSaved);
    expect(el.props.children[1]!.type).toBe(InterestRows);
    expect(el.props.children[1]!.props).toEqual(interests);
  });

  test("0.5.0: renderEmployment is the host's Employment component, which gives EmploymentRows the slot's props as they are, the finder of organization records, the holding vault's name when the shell lists it, the two work-place slots and the catalogue's origin", async () => {
    const host = createStakeholderRecordCardHost(platformOf());
    const slotProps = { title: "Employment", recordId: "r1", recordEntityUri: `${P}/e/r1`, vaultId: P, edgeKey: "employment", servedEdges: [{ "@id": `${P}/e/x1` }], servedReady: true, canEdit: true, onSaved: () => undefined };
    const el = host.renderEmployment!(slotProps) as unknown as { type: unknown; props: Record<string, unknown> };
    expect(typeof el.type).toBe("function");
    expect(el.type).not.toBe(EmploymentRows);
    expect(el.props).toEqual(slotProps);
    mountInProvider(world, host.renderEmployment!(slotProps));
    // The shell lists the holder's vaults after the first draw: the name arrives with the list.
    await waitFor(() => expect(seenRows[seenRows.length - 1]?.vaultName).toBe("Ann"));
    const given = seenRows[seenRows.length - 1]!;
    expect(Object.keys(given).sort()).toEqual([...Object.keys(slotProps), "catalogueOrigin", "find", "renderPlaceName", "renderWorkLocation", "vaultName"].sort());
    expect(given.find).toBe(findOrganizationRecords);
    expect(given.vaultName).toBe("Ann");
    expect(given.onSaved).toBe(slotProps.onSaved);
    // 0.5.0: the work place. The Location box and the read-only name are the units' own, mapped from the slot's names; the origin is the provider's `geoOrigin`.
    expect(typeof given.renderWorkLocation).toBe("function");
    expect(typeof given.renderPlaceName).toBe("function");
    expect(given.catalogueOrigin).toBe(GEO);
    const box = (given.renderWorkLocation as (p: unknown) => { type: unknown; props: Record<string, unknown> })({ placeId: "p1", placeLabel: "Oslo", onChange: () => undefined });
    expect(box.type).toBe(WorkLocationField);
    expect(box.props).toMatchObject({ placeId: "p1", label: "Oslo" });
    const name = (given.renderPlaceName as (p: unknown) => { type: unknown; props: Record<string, unknown> })({ placeId: "p1", placeLabel: "Oslo" });
    expect(name.type).toBe(WorkPlaceName);
    expect(name.props).toEqual({ placeId: "p1", label: "Oslo" });
    // the write guard: nothing is held back for a vault that is not the catalogue
    expect(given.canEdit).toBe(true);
    seenRows.length = 0;
    cleanup();
    // A vault the shell does not list has no name to give: none is passed (the section then says "this vault"). The list must have arrived first.
    const platform = platformOf();
    const listed: number[] = [];
    function VaultsProbe() {
      listed.push(platform.useShell().vaults.length);
      return null;
    }
    cleanup();
    mountInProvider(world, <><VaultsProbe />{host.renderEmployment!({ ...slotProps, vaultId: "https://elsewhere.example.test/base/pnone" })}</>);
    await waitFor(() => expect(listed[listed.length - 1]).toBeGreaterThan(0));
    await waitFor(() => expect(seenRows.length).toBeGreaterThan(0));
    expect(seenRows.every((g) => !("vaultName" in g))).toBe(true);
  });

  test("0.5.0: with no catalogue origin known, no catalogueOrigin is given (a compact place then reads as none), and the slots still are", async () => {
    const host = createStakeholderRecordCardHost(platformOf());
    const slotProps = { title: "Employment", recordId: "r1", recordEntityUri: `${P}/e/r1`, vaultId: P, edgeKey: "employment", servedEdges: [], servedReady: true, canEdit: true, onSaved: () => undefined };
    seenRows.length = 0;
    cleanup();
    // The provider sets the origin before its children render; the probe runs first among them and forgets it, as a page that never set one.
    function Forget() {
      resetGeoOrigin();
      return null;
    }
    mountInProvider(world, <><Forget />{host.renderEmployment!(slotProps)}</>);
    await waitFor(() => expect(seenRows.length).toBeGreaterThan(0));
    const given = seenRows[seenRows.length - 1]!;
    expect("catalogueOrigin" in given).toBe(false);
    expect(typeof given.renderWorkLocation).toBe("function");
    expect(given.canEdit).toBe(true);
  });

  test("0.5.0 (write guard): a section whose vault, record or employment edge is the place catalogue is given canEdit false; any other is given the slot's", async () => {
    const host = createStakeholderRecordCardHost(platformOf());
    const slotProps = { title: "Employment", recordId: "r1", recordEntityUri: `${P}/e/r1`, vaultId: P, edgeKey: "employment", servedEdges: [{ "@id": `${P}/e/x1` }], servedReady: true, canEdit: true, onSaved: () => undefined };
    const cases: Array<[string, Partial<typeof slotProps>, boolean]> = [
      ["no catalogue target", {}, true],
      ["the vault is the catalogue", { vaultId: `${GEO}/base` }, false],
      ["the record is a catalogue row", { recordEntityUri: `${GEO}/base/e/osm-r-1` }, false],
      ["an edge is a catalogue row", { servedEdges: [{ "@id": `${P}/e/x1` }, { "@id": `${GEO}/base/e/osm-r-1` }] }, false],
      ["an edge is a catalogue row, written as a bare string", { servedEdges: `${GEO}/base/e/osm-r-1` as unknown as never[] }, false],
      ["a catalogue address smuggled in a query is not the catalogue", { vaultId: `https://elsewhere.example.test/base/p?u=${GEO}/base/e/x` }, true],
    ];
    for (const [name, over, canEdit] of cases) {
      seenRows.length = 0;
      cleanup();
      mountInProvider(world, host.renderEmployment!({ ...slotProps, ...over }));
      await waitFor(() => expect(seenRows.length).toBeGreaterThan(0));
      expect(seenRows[seenRows.length - 1]!.canEdit, name).toBe(canEdit);
    }
    // a read-only slot stays read-only whatever the targets
    seenRows.length = 0;
    cleanup();
    mountInProvider(world, host.renderEmployment!({ ...slotProps, canEdit: false }));
    await waitFor(() => expect(seenRows.length).toBeGreaterThan(0));
    expect(seenRows[seenRows.length - 1]!.canEdit).toBe(false);
  });
});
