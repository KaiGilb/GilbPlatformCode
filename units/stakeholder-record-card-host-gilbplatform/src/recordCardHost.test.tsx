// The host this unit builds for the held card: its members are the provider's pieces, and nothing else is given.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useStakeholderCardPlatform, type StakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { LanguageSection } from "@kaigilb/gilbplatformcode-language-section";
import { createStakeholderRecordCardHost } from "./index";
import { createWorld, type World } from "../test/world";
import { mountInProvider } from "../test/harness";

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
    expect(Object.keys(host).sort()).toEqual(["photoReadKeys", "photoReadKeysSync", "renderLanguages", "useRefLabel", "useShell", "vocabulary"]);
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
    for (const k of ["holdingVaultOf", "renderRecordPicture", "renderBandIcon", "renderTypeDescription", "renderAttachments", "renderAddress", "renderEmployment", "renderSkillsAndInterests"]) expect(k in host).toBe(false);
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
});
