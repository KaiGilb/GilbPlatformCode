// The held record a field holds is the Employment, which carries the job title, the employer (WORKS-FOR) and two slot keys.
// The text is not told which of them were written, so it must not say "only the job title was saved".
// The sentence names the boxes that were written, the three-kinds join, and the labels of the written boxes.
import { describe, expect, it } from "vitest";
import { PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { stakeholderErrorText } from "./stakeholderCreate";
import { heldLabelsWritten, type PersonBox } from "./recordPerson";

const stuckProof = (method: string, url: string) =>
  new PlatformError(`${method} ${url} could not be reached: BoundTimeoutError: creating the DPoP proof timed out`, 0, url, "");

describe("the held record a field holds", () => {
  const held = "https://holder.example.test/vault/e/06held";
  it("a bound after a held record: the text does not claim which field it held", () => {
    const err = new PartialCreateError("the record could not be created after 1 record(s) a field holds were written", {
      record: null, written: [held], vaultId: "holder", cause: stuckProof("POST", "https://holder.example.test/lws/vault/x/c"),
    });
    const text = stakeholderErrorText(err, "create", "Ann");
    expect(text).toMatch(/was not created/);
    expect(text).not.toMatch(/job title/);
  });
  it("a refused person after a held record: the text does not claim which field it held", () => {
    const err = new PartialCreateError("the record could not be created after 1 record(s) a field holds were written", {
      record: null, written: [held], vaultId: "holder", cause: new PlatformError("POST x answered 500", 500, "x", "{}"),
    });
    const text = stakeholderErrorText(err, "create", "Ann");
    expect(text).toMatch(/was not created/);
    expect(text).not.toMatch(/job title/);
  });
});

describe("the sentence names the boxes whose record was written", () => {
  const held = "https://holder.example.test/vault/e/06held";
  const bound = () =>
    new PartialCreateError("x", { record: null, written: [held], vaultId: "holder", cause: stuckProof("POST", "https://holder.example.test/lws/vault/x/c") });
  const refused = () =>
    new PartialCreateError("x", { record: null, written: [held], vaultId: "holder", cause: new PlatformError("POST x answered 500", 500, "x", "{}") });

  it("one written box is named alone; two are named together; none known says the other person details", () => {
    expect(stakeholderErrorText(bound(), "create", "Ann", undefined, ["Works for"])).toBe(
      "“Ann” was not created (signing the request did not answer within 10 s); only “Works for” was saved. Try again.",
    );
    expect(stakeholderErrorText(bound(), "create", "Ann", undefined, ["Job title", "Works for"])).toBe(
      "“Ann” was not created (signing the request did not answer within 10 s); only “Job title” and “Works for” were saved. Try again.",
    );
    expect(stakeholderErrorText(bound(), "create", "Ann")).toBe(
      "“Ann” was not created (signing the request did not answer within 10 s); only the other person details were saved. Try again.",
    );
    expect(stakeholderErrorText(bound(), "create", "Ann", undefined, [])).toMatch(/only the other person details were saved/);
  });

  it("a refused person (no bound) names them the same way", () => {
    expect(stakeholderErrorText(refused(), "create", "Ann", undefined, ["Works for"])).toBe(
      "“Ann” was not created; only “Works for” was saved. Try again.",
    );
    expect(stakeholderErrorText(refused(), "create", "Ann", undefined, ["Job title", "Works for", "Pending claim slot key"])).toBe(
      "“Ann” was not created; only “Job title”, “Works for” and “Pending claim slot key” were saved. Try again.",
    );
  });

  it("three kinds are joined with commas and one 'and'", () => {
    const record = "https://holder.example.test/vault/e/06abc";
    const err = new PartialCreateError(`${record} was created and its tag "ann" could not be registered`, {
      record, written: [record], vaultId: "holder", cause: stuckProof("POST", "http://holder.example.test/base/tag/attach"),
    });
    expect(stakeholderErrorText(err, "create", "Ann", { kinds: ["Colleague", "Friend", "Advisor"] })).toBe(
      "“Ann” was created, but signing the request did not answer within 10 s. Its kinds “Colleague”, “Friend” and “Advisor” were not written; add the kinds on its card. Do not create it again.",
    );
    expect(stakeholderErrorText(err, "create", "Ann", { kinds: ["Colleague", "Friend", "Advisor"], linkTo: "Ben" })).toBe(
      "“Ann” was created, but signing the request did not answer within 10 s. Its kinds “Colleague”, “Friend” and “Advisor” and the link to “Ben” were not written; add the kinds and the link on its card. Do not create it again.",
    );
  });
});

describe("which labels the written held records carry", () => {
  const box = (field: string, sub: string | null, label: string): PersonBox => ({ key: sub ? `${field}/${sub}` : field, label, field, sub });
  const boxes = [
    box("a:note", null, "Note"),
    box("a:employment", "a:jobTitle", "Job title"),
    box("a:employment", "a:org", "Works for"),
    box("a:employment", "a:pendingClaimSlotKey", "Pending claim slot key"),
    box("a:address", "a:streetLine", "Street"),
  ];
  it("only the filled boxes of a field that holds a record are named, and only for as many records as were written", () => {
    const org = { "a:employment/a:org": "Acme" };
    expect(heldLabelsWritten(boxes, org, 1)).toEqual(["Works for"]);
    expect(heldLabelsWritten(boxes, { ...org, "a:employment/a:jobTitle": " Engineer " }, 1)).toEqual(["Job title", "Works for"]);
    expect(heldLabelsWritten(boxes, { "a:employment/a:pendingClaimSlotKey": "k1" }, 1)).toEqual(["Pending claim slot key"]);
    const two = { ...org, "a:address/a:streetLine": "Main St" };
    expect(heldLabelsWritten(boxes, two, 1)).toEqual(["Works for"]);
    expect(heldLabelsWritten(boxes, two, 2)).toEqual(["Works for", "Street"]);
  });
  it("a plain text box is not a held record, an empty box is not written, and an impossible count is unknown", () => {
    expect(heldLabelsWritten(boxes, { "a:note": "hello" }, 1)).toBeNull();
    expect(heldLabelsWritten(boxes, { "a:employment/a:org": "  " }, 1)).toBeNull();
    expect(heldLabelsWritten(boxes, { "a:employment/a:org": "Acme" }, 0)).toBeNull();
    expect(heldLabelsWritten(boxes, { "a:employment/a:org": "Acme" }, 2)).toBeNull();
  });
});
