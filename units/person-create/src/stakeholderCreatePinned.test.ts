// The quick list, the held vaults and the error text pinned, beside the ported tests: each branch of a sentence, the defaults and their order,
// and the constants. The kinds and the vaults are built in the test; the errors are the packages' own classes.
import { describe, expect, it } from "vitest";
import { CreateRefusedError, PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { BoundTimeoutError } from "@kaigilb/gilbplatformcode-lws-relations";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import type { TypeOption } from "@kaigilb/gilbplatformcode-ontology-reads";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  STAKEHOLDER_FIND_DEBOUNCE_MS,
  STAKEHOLDER_FIND_MIN_CHARS,
  answeredNoTag,
  defaultHeldVaultId,
  heldVaults,
  isStakeholderKindOption,
  stakeholderErrorText,
  stakeholderTypeOptions,
  stakeholderTypeSearch,
  stepsNotWrittenSentence,
} from "./stakeholderCreate";
import { plainBoundStep } from "./plainBoundStep";
import { canWriteVault } from "./canWriteVault";

const HOST = "https://holder.example.test";
const vault = (id: string, over: Partial<ReachableVault> = {}): ReachableVault => ({
  vaultId: `${HOST}/base/${id}`,
  entity: `${HOST}/base/${id}/e`,
  name: id,
  parent: null,
  parentAmbiguous: false,
  modes: ["read", "write"],
  represents: null,
  isLandingVault: false,
  ...over,
});

describe("the constants", () => {
  it("the find waits 300 ms for typing to settle and starts at two characters", () => {
    expect(STAKEHOLDER_FIND_DEBOUNCE_MS).toBe(300);
    expect(STAKEHOLDER_FIND_MIN_CHARS).toBe(2);
  });
});

describe("the small copies", () => {
  it("canWriteVault asks the set of modes and nothing else", () => {
    expect(canWriteVault(vault("a"))).toBe(true);
    expect(canWriteVault(vault("a", { modes: ["write"] }))).toBe(true);
    expect(canWriteVault(vault("a", { modes: ["read"] }))).toBe(false);
    expect(canWriteVault(vault("a", { modes: [], isLandingVault: true }))).toBe(false);
  });
  it("plainBoundStep says the request is signed where the proof's own name would be jargon, whatever the case, and leaves other steps", () => {
    expect(plainBoundStep("creating the DPoP proof")).toBe("signing the request");
    expect(plainBoundStep("while Creating The DPoP Proof, then")).toBe("while signing the request, then");
    expect(plainBoundStep("signing in")).toBe("signing in");
  });
});

describe("the quick list", () => {
  const kind = (name: string, label: string | null) => ({ name, label, kind: `k/${name}`, fields: [{ readKeys: ["a:name"], writeKey: "a:name" }] });
  const sets = (kinds: ReturnType<typeof kind>[]) =>
    ({ kinds: { predicates: { name: { writeKey: "a:name" } } }, byKind: Object.fromEntries(kinds.map((k) => [k.name, k])) }) as unknown as StakeholderFieldSets;

  it("an option is the kind with its master label (the bare name when there is none), a `veda:` id and no spec", () => {
    expect(stakeholderTypeOptions(sets([kind("Org", "Organization"), kind("Bare", null)]))).toEqual([
      { id: "veda:Bare", label: "Bare", typeName: "Bare", spec: null, kind: "type" },
      { id: "veda:Org", label: "Organization", typeName: "Org", spec: null, kind: "type" },
    ]);
  });

  const options: TypeOption[] = stakeholderTypeOptions(sets([kind("Person", "Person"), kind("SoftwareSystem", "Software System"), kind("Org", "Organization")]));

  it("a blank query, or only spaces, gives every option and the reach without a quotation", async () => {
    const search = stakeholderTypeSearch(options, "Stakeholder");
    for (const q of ["", "   "]) {
      const res = await search(q);
      expect(res.options).toBe(options);
      expect(res).toMatchObject({ reach: "The kinds of Stakeholder the GilbVeda master names.", degraded: false });
    }
    expect((await stakeholderTypeSearch(options, null)("")).reach).toBe("The kinds the GilbVeda master names for this list.");
  });
  it("a query is trimmed, matched in the label or in the type name without regard to case, and quoted in the reach", async () => {
    const search = stakeholderTypeSearch(options, null);
    const res = await search("  SYSTEM ");
    expect(res.options.map((o) => o.id)).toEqual(["veda:SoftwareSystem"]);
    expect(res.reach).toBe("The kinds the GilbVeda master names for this list. Showing those matching “SYSTEM”.");
    expect((await search("ganiz")).options.map((o) => o.id)).toEqual(["veda:Org"]);
    expect((await search("softwaresystem")).options.map((o) => o.id)).toEqual(["veda:SoftwareSystem"]);
    expect((await search("zzz")).options).toEqual([]);
  });
  it("isStakeholderKindOption compares by id and is false when there is no list", () => {
    expect(isStakeholderKindOption({ ...options[0]! }, options)).toBe(true);
    expect(isStakeholderKindOption({ ...options[0]!, id: "veda:Other" }, options)).toBe(false);
    expect(isStakeholderKindOption(options[0]!, null)).toBe(false);
    expect(isStakeholderKindOption(options[0]!, [])).toBe(false);
  });
});

describe("the held vaults and their default", () => {
  const landing = vault("l", { isLandingVault: true });
  const nested = vault("n", { parent: { entity: landing.entity!, vaultId: landing.vaultId } });
  const writable = vault("w");
  it("an absent list, or none, is nowhere; a held vault is kept in the order given", () => {
    expect(heldVaults(null)).toEqual([]);
    expect(heldVaults(undefined)).toEqual([]);
    expect(heldVaults([])).toEqual([]);
    expect(heldVaults([nested, writable, landing])).toEqual([nested, landing]);
  });
  it("the default is the open vault when held, else the landing vault, else the first held, else nothing", () => {
    const held = [nested, landing];
    expect(defaultHeldVaultId(held, nested.vaultId)).toBe(nested.vaultId);
    expect(defaultHeldVaultId(held, writable.vaultId)).toBe(landing.vaultId);
    expect(defaultHeldVaultId(held, null)).toBe(landing.vaultId);
    expect(defaultHeldVaultId([nested], null)).toBe(nested.vaultId);
    expect(defaultHeldVaultId([], nested.vaultId)).toBeNull();
  });
});

describe("stepsNotWrittenSentence", () => {
  it("is empty when this act meant neither a kind nor a link", () => {
    expect(stepsNotWrittenSentence(undefined)).toBe("");
    expect(stepsNotWrittenSentence({})).toBe("");
    expect(stepsNotWrittenSentence({ kinds: ["  ", ""], linkTo: "   " })).toBe("");
    expect(stepsNotWrittenSentence({ kinds: [], linkTo: null })).toBe("");
  });
  it("says one kind, many kinds, the link, and each together, trimmed", () => {
    expect(stepsNotWrittenSentence({ kinds: [" Friend "] })).toBe("Its kind “Friend” was not written; add the kind on its card.");
    expect(stepsNotWrittenSentence({ kinds: ["Friend", "Colleague"] })).toBe("Its kinds “Friend” and “Colleague” were not written; add the kinds on its card.");
    expect(stepsNotWrittenSentence({ linkTo: " Ben " })).toBe("The link to “Ben” was not written; add the link on its card.");
    expect(stepsNotWrittenSentence({ kinds: ["Friend"], linkTo: "Ben" })).toBe("Its kind “Friend” and the link to “Ben” were not written; add the kind and the link on its card.");
  });
});

describe("answeredNoTag", () => {
  const partial = (cause: unknown) => new PartialCreateError("x", { record: "r", written: ["r"], vaultId: "v", cause });
  const platform = (status: number, url: string) => new PlatformError("x", status, url, "");
  const ENSURE = `${HOST}/base/tag/ensure`;

  it("is true for a 4xx answer of the tag ensure route, however its url ends", () => {
    for (const status of [400, 403, 499]) expect(answeredNoTag(partial(platform(status, ENSURE)))).toBe(true);
    expect(answeredNoTag(partial(platform(404, `${ENSURE}?vault=v`)))).toBe(true);
    expect(answeredNoTag(partial(platform(404, `${ENSURE}#x`)))).toBe(true);
  });
  it("is false for a 5xx, a status below 400, another route, a longer route or a cause that is not a platform answer", () => {
    expect(answeredNoTag(partial(platform(500, ENSURE)))).toBe(false);
    expect(answeredNoTag(partial(platform(399, ENSURE)))).toBe(false);
    expect(answeredNoTag(partial(platform(403, `${HOST}/base/tag/master`)))).toBe(false);
    expect(answeredNoTag(partial(platform(403, `${ENSURE}x`)))).toBe(false);
    expect(answeredNoTag(partial(new Error("boom")))).toBe(false);
    expect(answeredNoTag(partial(null))).toBe(false);
  });
});

describe("stakeholderErrorText: the branches the wording tests do not reach", () => {
  const stuck = (url: string) => new PlatformError(`GET ${url} could not be reached: BoundTimeoutError: creating the DPoP proof timed out`, 0, url, "");
  const partial = (over: { record?: string | null; written?: string[]; cause?: unknown; message?: string }) =>
    new PartialCreateError(over.message ?? "x", { record: over.record ?? null, written: over.written ?? [], vaultId: "v", cause: over.cause ?? null });

  it("a partial with nothing written and no bound: nothing was created, or no match could be looked up", () => {
    expect(stakeholderErrorText(partial({}))).toBe("Nothing was created. Try again.");
    expect(stakeholderErrorText(partial({}), "lookup")).toBe("Could not look up matches.");
  });
  it("a partial that wrote only held records, with no bound, says the person was not created, with and without a name", () => {
    const err = partial({ written: ["h"] });
    expect(stakeholderErrorText(err, "create", "Ann")).toBe("“Ann” was not created; only the other person details were saved. Try again.");
    expect(stakeholderErrorText(err)).toBe("The record was not created; only the other person details were saved. Try again.");
    expect(stakeholderErrorText(err, "create", "  ", undefined, ["  "])).toBe("The record was not created; only the other person details were saved. Try again.");
  });
  it("a partial with the record gives the reason of the later step in plain words", () => {
    const record = `${HOST}/base/e/r1`;
    expect(stakeholderErrorText(partial({ record, message: "the record was created and could not be read back at x" }), "create", "Ann")).toBe("“Ann” was created, but it could not be read back. Do not create it again.");
    expect(stakeholderErrorText(partial({ record, message: "its TAG COULD NOT BE READ OR MADE" }), "create", "Ann")).toBe("“Ann” was created, but its tag could not be read or made. Do not create it again.");
    expect(stakeholderErrorText(partial({ record, message: "something else" }))).toBe("A record was created, but a later step did not finish. Do not create it again.");
  });
  it("a bound in the cause of a partial that has the record, or only held records, or nothing, is said as the step that did not answer", () => {
    const cause = stuck(`${HOST}/base/tag/ensure`);
    expect(stakeholderErrorText(partial({ record: "r", cause }))).toBe("A record was created, but signing the request did not answer within 10 s. Do not create it again.");
    expect(stakeholderErrorText(partial({ written: ["h"], cause }), "create", "Ann", undefined, ["Works for"])).toBe(
      "“Ann” was not created (signing the request did not answer within 10 s); only “Works for” was saved. Try again.",
    );
    expect(stakeholderErrorText(partial({ cause }))).toBe("Signing the request did not answer within 10 s; nothing was created. Try again.");
    expect(stakeholderErrorText(partial({ cause }), "lookup")).toBe("Could not look up matches: signing the request did not answer within 10 s.");
  });
  it("a bound that is not a partial: with a record id (a non-empty string) the record was created; with none, an empty one or a non-string, it was not", () => {
    const withRecord = (record: unknown) => Object.assign(new BoundTimeoutError("signing in"), { record });
    expect(stakeholderErrorText(withRecord("r1"), "create", "Ann")).toBe("“Ann” was created, but signing in did not answer within 10 s. Do not create it again.");
    expect(stakeholderErrorText(withRecord(""))).toBe("Signing in did not answer within 10 s; nothing was created. Try again.");
    expect(stakeholderErrorText(withRecord(7))).toBe("Signing in did not answer within 10 s; nothing was created. Try again.");
    expect(stakeholderErrorText(new BoundTimeoutError("signing in"), "lookup")).toBe("Could not look up matches: signing in did not answer within 10 s.");
  });
  it("a bound is found in a string error, in a cause chain that loops back on itself, and not in an error with no step in its words", () => {
    expect(stakeholderErrorText("BoundTimeoutError: signing in timed out")).toBe("Signing in did not answer within 10 s; nothing was created. Try again.");
    const loop = new Error("a") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(stakeholderErrorText(loop)).toBe("a");
    expect(stakeholderErrorText(new Error("BoundTimeoutError:  timed out"))).toBe("BoundTimeoutError:  timed out");
  });
  it("a plain refusal, a vocabulary that is not known yet, an error and anything else are said in their own words, and a lookup says so first", () => {
    expect(stakeholderErrorText(new CreateRefusedError("x" as never, "no name"))).toBe("Not recorded: no name");
    expect(stakeholderErrorText(new VocabularyUnavailableError("master slow"))).toBe("Not known yet: master slow");
    expect(stakeholderErrorText(new Error("plain"))).toBe("plain");
    expect(stakeholderErrorText("text")).toBe("text");
    expect(stakeholderErrorText(null)).toBe("null");
    expect(stakeholderErrorText(42, "create")).toBe("42");
    expect(stakeholderErrorText(new CreateRefusedError("x" as never, "no name"), "lookup")).toBe("Matches not known: Not recorded: no name");
    expect(stakeholderErrorText(new Error("plain"), "lookup")).toBe("Matches not known: plain");
  });
  it("a name that is only spaces is no name", () => {
    expect(stakeholderErrorText(partial({ record: "r", cause: stuck(`${HOST}/x`) }), "create", "   ")).toBe("A record was created, but signing the request did not answer within 10 s. Do not create it again.");
  });
});
