// "+ Add your own" in place on the one card, for the Email, Phone and Online account groups. The card's real pieces: `ContactRows`, the real merge (`oneCardOf`) and placement (`placeOneCard`), the real card mode. Only the record store is a stand-in: `patchRecord` keeps what was written, and `onSaved` re-reads it into the card.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../test/host";
import { patchRecord, readRecord } from "../test/records";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { ADD_OWN_WORDS } from "@kaigilb/gilbplatformcode-add-your-own";
import type { OneCardField } from "@kaigilb/gilbplatformcode-one-card-merge";
import type { OnlineCard } from "@kaigilb/gilbplatformcode-online-card";


import { ContactRows } from "./ContactRows";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { OneCardProvider, oneCardOf, placeOneCard, type OneCardView } from "@kaigilb/gilbplatformcode-one-card-context";
import { EMAIL_FORMAT_HINT } from "./emailFormat";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
  readRecord.mockReset();
});

const ANN = "https://ann.example.test/vault";
const TERM = (n: string) => `https://ontology.example.test/base/a/${n}`;
const FIELDS: OneCardField[] = [
  { term: TERM("email"), label: "Email", readKeys: ["email", "a:email"], writeKey: "a:email", many: true },
  { term: TERM("phone"), label: "Phone", readKeys: ["phone", "a:phone"], writeKey: "a:phone", many: true },
  { term: TERM("account"), label: "Online account", readKeys: ["account", "a:account"], writeKey: "a:account", many: true },
];
const ONLINE: OnlineCard = {
  principal: ANN,
  photoUrl: null,
  skills: [],
  fields: [
    { predicate: "a:email", value: "ann@example.org", rung: "public", sourceEntity: `${ANN}/e/em`, kind: "email" },
    { predicate: "a:phone", value: "+47 900 12 345", rung: "t:EitherContextCloseCircleGrantee", sourceEntity: `${ANN}/e/ph`, kind: "phone" },
  ],
};
type Kind = "email" | "phone" | "social";
const KEY: Record<Kind, string> = { email: "email", phone: "phone", social: "account" };
const TITLE: Record<Kind, string> = { email: "Email", phone: "Phone", social: "Online account" };

let seq = 0;
/** The holder's record as the store holds it; `patchRecord` writes into it. */
let store: Record<string, unknown>;

function Card({ kind, canEdit = true, oneCard = true }: { kind: Kind; canEdit?: boolean; oneCard?: boolean }) {
  const [recordId] = useState(() => `rec-s5e-${++seq}`);
  const [facts, setFacts] = useState<Record<string, unknown>>(() => ({ ...store }));
  const view = useMemo<OneCardView>(() => {
    const card = oneCardOf({ online: ONLINE, servedFacts: facts, fieldOrder: FIELDS, skillPredicate: null });
    const placed = placeOneCard(card, (g) => (g.field === "a:email" ? "email" : g.field === "a:phone" ? "phone" : g.field === "a:account" ? "social" : null));
    return { marks: card.marks, byKind: placed.byKind, own: placed.own, rowLabel: () => null, valueText: (r) => r.value };
  }, [facts]);
  const rows = (
    <ContactRows
      kind={kind}
      recordId={recordId}
      recordEntityUri={null}
      title={TITLE[kind]}
      valueKey={KEY[kind]}
      metaKey="fieldMeta"
      served={{ values: facts[KEY[kind]], meta: facts.fieldMeta }}
      etag={String(facts.etag ?? "e0")}
      canEdit={canEdit}
      onSaved={() => setFacts({ ...store })}
    />
  );
  return (
    <CardModeProvider canEdit={canEdit}>
      <CardModeBar />
      {oneCard ? <OneCardProvider view={view}>{rows}</OneCardProvider> : rows}
    </CardModeProvider>
  );
}

/** The record store: a PATCH merges into it and moves its version on. */
function storeAccepts() {
  let n = 0;
  patchRecord.mockImplementation(async (_id: string, patch: Record<string, unknown>) => {
    store = { ...store, ...patch, etag: `e${++n}` };
    return { etag: `e${n}` };
  });
}

const group = (kind: Kind) => document.querySelector<HTMLElement>(`section[data-group="${kind}"]`)!;
const addOwn = (kind: Kind) => within(group(kind)).getByTestId("add-own");
const theirValues = (kind: Kind) => within(group(kind)).queryAllByTestId("one-card-row").map((r) => within(r).getByTestId("one-card-row-value").textContent);
const ownRows = (kind: Kind) => within(group(kind)).queryAllByTestId("one-card-own-row");

describe("S5e + Add your own, in place on the one card", () => {
  // Spec 18f: the master card with the holder's own fields added to it; mockup tab C: the button under each group.
  it("shows '+ Add your own' under a group that holds their rows, while the card is presented; not in Edit (the editor's own add is there)", async () => {
    store = {};
    render(<Card kind="email" />);
    expect(addOwn("email").textContent).toBe(ADD_OWN_WORDS.button);
    expect(addOwn("email").getAttribute("aria-label")).toBe("Add your own email");
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(within(group("email")).queryByTestId("add-own")).toBeNull();
    expect(within(group("email")).getByTestId("email-add")).toBeTruthy();
  });

  // Design §4: both equal (normalized) -> ONE row of theirs, "You have the same on your card".
  it("adding an email EQUAL to theirs: saved on the holder's record, and the group shows ONE row of theirs that says you have the same", async () => {
    store = {};
    storeAccepts();
    render(<Card kind="email" />);
    await userEvent.click(addOwn("email"));
    const box = within(group("email")).getByRole("textbox", { name: "Your own email" });
    expect(document.activeElement).toBe(box);
    await userEvent.type(box, "Ann@Example.org{Enter}");
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(patchRecord.mock.calls[0]![1].email).toEqual(["Ann@Example.org"]);
    await waitFor(() => expect(within(group("email")).queryByTestId("add-own-form")).toBeNull());
    await waitFor(() => expect(within(group("email")).getByTestId("one-card-row-same").textContent).toBe("You have the same on your card."));
    expect(theirValues("email")).toEqual(["ann@example.org"]);
    expect(ownRows("email")).toHaveLength(0);
    // the focus is back on the button
    expect(document.activeElement).toBe(addOwn("email"));
  });

  // Design §4: both, different values -> both rows, theirs first; Kai 2026-08-31 "if there are two I want both".
  it("adding a phone DIFFERENT from theirs: both rows, theirs first, yours marked Yours · private", async () => {
    store = {};
    storeAccepts();
    render(<Card kind="phone" />);
    await userEvent.click(addOwn("phone"));
    const code = within(group("phone")).getByRole("textbox", { name: "Country code" });
    expect(document.activeElement).toBe(code);
    fireEvent.change(code, { target: { value: "+47" } });
    await userEvent.type(within(group("phone")).getByRole("textbox", { name: "Phone number" }), "913 55 210{Enter}");
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(patchRecord.mock.calls[0]![1].phone).toEqual(["+47 913 55 210"]);
    await waitFor(() => expect(ownRows("phone")).toHaveLength(1));
    expect(theirValues("phone")).toEqual(["+47 900 12 345"]);
    // C214-UI2 (changed on purpose, Kai "Remove the Their/Yours badges"): a row of yours carries no mark (was "Yours · private").
    expect(within(ownRows("phone")[0]!).queryByTestId("one-card-mark")).toBeNull();
    expect(ownRows("phone")[0]!.textContent).toContain("+47 913 55 210");
    const text = group("phone").textContent ?? "";
    expect(text.indexOf("+47 900 12 345")).toBeLessThan(text.indexOf("+47 913 55 210"));
  });

  it("Cancel writes nothing, drops what was typed, and returns the focus to the button", async () => {
    store = {};
    storeAccepts();
    render(<Card kind="email" />);
    await userEvent.click(addOwn("email"));
    await userEvent.type(within(group("email")).getByRole("textbox", { name: "Your own email" }), "ben@home.org");
    await userEvent.click(within(group("email")).getByTestId("add-own-cancel"));
    expect(within(group("email")).queryByTestId("add-own-form")).toBeNull();
    expect(document.activeElement).toBe(addOwn("email"));
    await new Promise((r) => setTimeout(r, 50));
    expect(patchRecord).not.toHaveBeenCalled();
    expect(ownRows("email")).toHaveLength(0);
    expect(group("email").textContent).not.toContain("ben@home.org");
    // opened again, the box is empty
    await userEvent.click(addOwn("email"));
    expect((within(group("email")).getByRole("textbox", { name: "Your own email" }) as HTMLInputElement).value).toBe("");
  });

  it("Esc writes nothing and returns the focus to the button", async () => {
    store = {};
    storeAccepts();
    render(<Card kind="phone" />);
    await userEvent.click(addOwn("phone"));
    await userEvent.type(within(group("phone")).getByRole("textbox", { name: "Phone number" }), "913 55 210");
    await userEvent.keyboard("{Escape}");
    expect(within(group("phone")).queryByTestId("add-own-form")).toBeNull();
    expect(document.activeElement).toBe(addOwn("phone"));
    await new Promise((r) => setTimeout(r, 50));
    expect(patchRecord).not.toHaveBeenCalled();
  });

  // The existing editor's validation: an address that does not fit is never saved, and the row says why (Kai 2026-10-14).
  it("validation as the existing editor: an email that does not fit is not saved; the form stays open with the editor's own hint", async () => {
    store = {};
    storeAccepts();
    render(<Card kind="email" />);
    await userEvent.click(addOwn("email"));
    await userEvent.type(within(group("email")).getByRole("textbox", { name: "Your own email" }), "not-an-email{Enter}");
    expect((await within(group("email")).findByTestId("add-own-message")).textContent).toContain(EMAIL_FORMAT_HINT);
    expect(patchRecord).not.toHaveBeenCalled();
    expect(within(group("email")).getByTestId("add-own-form")).toBeTruthy();
  });

  // The existing editor's error: "The email could not be saved: <reason>", on the section; nothing typed is lost.
  it("error path as the existing editor: a refused write shows the editor's own error, keeps the form and the value, and draws no own row", async () => {
    store = {};
    patchRecord.mockRejectedValue(new Error("the vault answered 503"));
    render(<Card kind="email" />);
    await userEvent.click(addOwn("email"));
    await userEvent.type(within(group("email")).getByRole("textbox", { name: "Your own email" }), "ben@home.org{Enter}");
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(await within(group("email")).findByText("The email could not be saved: the vault answered 503")).toBeTruthy();
    expect(within(group("email")).getByTestId("add-own-form")).toBeTruthy();
    expect((within(group("email")).getByRole("textbox", { name: "Your own email" }) as HTMLInputElement).value).toBe("ben@home.org");
    expect(ownRows("email")).toHaveLength(0);
  });

  it("skill: '+ Add your own' opens the section's own skill picker; Esc closes it with nothing written and the focus back on the button", async () => {
    store = { skill: [] };
    storeAccepts();
    const FIELDS_SKILL = [...FIELDS, { term: TERM("skill"), label: "Skill", readKeys: ["skill", "a:skill"], writeKey: "a:skill", many: true }];
    const theirs: OnlineCard = { ...ONLINE, skills: [{ skillUri: "https://ontology.example.test/base/e/planguage", rung: "public" } as OnlineCard["skills"][number]] };
    function SkillCard() {
      const view = useMemo<OneCardView>(() => {
        const card = oneCardOf({ online: theirs, servedFacts: {}, fieldOrder: FIELDS_SKILL, skillPredicate: "a:skill" });
        const placed = placeOneCard(card, (g) => (g.field === "a:skill" ? "skill" : null));
        return { marks: card.marks, byKind: placed.byKind, own: placed.own, rowLabel: () => null, valueText: (r) => r.value };
      }, []);
      return (
        <CardModeProvider canEdit>
          <OneCardProvider view={view}>
            <ContactRows kind="skill" recordId="rec-s5e-skill" recordEntityUri={null} title="Skill" valueKey="skill" metaKey="fieldMeta" served={{ values: [] }} etag="e0" canEdit onSaved={() => {}} />
          </OneCardProvider>
        </CardModeProvider>
      );
    }
    render(<SkillCard />);
    const add = within(document.querySelector<HTMLElement>('section[data-group="skill"]')!).getByTestId("add-own");
    expect(add.getAttribute("aria-label")).toBe("Add your own skill");
    await userEvent.click(add);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(add);
    expect(patchRecord).not.toHaveBeenCalled();
  });

  it("a read-only holder sees no '+ Add your own'", () => {
    store = {};
    render(<Card kind="email" canEdit={false} />);
    expect(group("email")).toBeTruthy();
    expect(within(group("email")).queryByTestId("add-own")).toBeNull();
  });

  it("outside the one card (an unlinked card) there is no '+ Add your own'", () => {
    store = { email: ["ben@home.org"], fieldMeta: { email: { type: "email", label: "Work", order: 1, access: "private", valueIndex: 0 } } };
    render(<Card kind="email" oneCard={false} />);
    expect(screen.queryByTestId("add-own")).toBeNull();
  });
});

/**
 * The same write as the existing editor: the request "+ Add your own" sends for a value is the request the existing editor sends when
 * the holder adds the same value (Edit, "add email", type, leave the box). Measured on a record that already holds one value, so the
 * row's label and the sidecar's pairing are compared too.
 */
describe("S5e the same write request as the existing editor", () => {
  const HELD = {
    email: ["ben@work.org"],
    phone: ["+47 222 33 444"],
    account: ["https://github.com/tom"],
    fieldMeta: {
      email: { type: "email", label: "Work", order: 1, access: "private", valueIndex: 0 },
      phone: { type: "phone", label: "", order: 2, access: "private", valueIndex: 0 },
      account: { type: "social", label: "GitHub", order: 3, access: "private", valueIndex: 0 },
    },
  };
  const VALUE: Record<Kind, string> = { email: "ben@home.org", phone: "+47 913 55 210", social: "linkedin.com/in/tom" };

  async function viaExistingEditor(kind: Kind) {
    store = structuredClone(HELD);
    storeAccepts();
    render(<Card kind={kind} />);
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click(within(group(kind)).getByTestId(`${kind}-add`));
    if (kind === "phone") {
      const code = within(group(kind)).getAllByRole("textbox", { name: "Country code" }).at(-1)!;
      fireEvent.change(code, { target: { value: "+47" } });
      await userEvent.type(within(group(kind)).getAllByRole("textbox", { name: "Phone number" }).at(-1)!, "913 55 210{Enter}");
    } else {
      const box = within(group(kind)).getAllByTestId(`${kind}-row-input`).at(-1)!;
      await userEvent.type(box, VALUE[kind]);
      fireEvent.blur(box);
    }
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const call = patchRecord.mock.calls[0]!;
    cleanup();
    patchRecord.mockReset();
    return call;
  }

  async function viaAddYourOwn(kind: Kind) {
    store = structuredClone(HELD);
    storeAccepts();
    render(<Card kind={kind} />);
    await userEvent.click(addOwn(kind));
    if (kind === "phone") {
      fireEvent.change(within(group(kind)).getByRole("textbox", { name: "Country code" }), { target: { value: "+47" } });
      await userEvent.type(within(group(kind)).getByRole("textbox", { name: "Phone number" }), "913 55 210{Enter}");
    } else {
      await userEvent.type(within(group(kind)).getByRole("textbox", { name: `Your own ${kind === "email" ? "email" : "online account"}` }), `${VALUE[kind]}{Enter}`);
    }
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const call = patchRecord.mock.calls[0]!;
    // one write per add, as the existing editor
    await new Promise((r) => setTimeout(r, 50));
    expect(patchRecord).toHaveBeenCalledTimes(1);
    return call;
  }

  for (const kind of ["email", "phone", "social"] as const) {
    it(`${kind}: byte-equal patch body and the same If-Match`, async () => {
      const a = await viaExistingEditor(kind);
      const b = await viaAddYourOwn(kind);
      // [recordId, patch, entityUri, _, { ifMatch }]: the record id is the harness's own per mount
      expect(JSON.stringify(b[1])).toBe(JSON.stringify(a[1]));
      expect(b[2]).toEqual(a[2]);
      expect(b[3]).toEqual(a[3]);
      expect(b[4]).toEqual(a[4]);
    });
  }
});
