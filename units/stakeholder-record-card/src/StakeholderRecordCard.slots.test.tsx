// The pieces the host draws: what each slot is called with, when it is called, and what the card draws when it is absent.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RecordDetail, ShellContext, seam, type ShellContextValue } from "../test/app";
import { HELD_VAULT, cardWorld, newQc, personRecord, putList, shellOf, P } from "../test/cardWorld";

const FACTS = { givenName: "Tom", familyName: "Gilb", postalAddress: "Storgata 1", employment: "https://h.gilb.test/base/e/job1", skill: "https://x.gilb.test/base/t/Nursing", contactLanguage: "no" };

function tree(qc: QueryClient, shell: ShellContextValue) {
  return (
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={shell}>
        <RecordDetail />
      </ShellContext.Provider>
    </QueryClientProvider>
  );
}
const ready = () => waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });

function held(facts: Record<string, unknown> = FACTS, over: Record<string, unknown> = {}) {
  const rec = personRecord("pn", facts, over);
  const qc = newQc();
  putList(qc, P, [rec]);
  return { rec, qc };
}

describe("the four sections", () => {
  it("each slot is called with the props the source passed its component", async () => {
    cardWorld();
    const calls: Record<string, unknown> = {};
    seam.address = (p) => ((calls.address = p), <div data-testid="s-address">{p.title}</div>);
    seam.employment = (p) => ((calls.employment = p), <div data-testid="s-employment">{p.title}</div>);
    seam.languages = (p) => ((calls.languages = p), <div data-testid="s-languages" />);
    seam.skillsAndInterests = (p) => ((calls.skills = p), <div data-testid="s-skills">{p.skills.title}</div>);
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    await screen.findByTestId("s-address");
    expect(calls.address).toMatchObject({ title: "Postal Address", legacyText: "Storgata 1", vaultId: P, recordEntityUri: rec.entityUri, principal: "https://id.gilb.test/base/p/0b6c9a52-agent", canEdit: true });
    expect(calls.employment).toMatchObject({ title: "Employment", recordId: "pn", recordEntityUri: rec.entityUri, vaultId: P, edgeKey: "employment", servedReady: true, canEdit: true });
    expect(calls.languages).toMatchObject({ vaultId: P, recordEntityUri: rec.entityUri, canEdit: true, contactTag: "no" });
    expect(typeof (calls.languages as { writeContact: unknown }).writeContact).toBe("function");
    expect(calls.skills).toMatchObject({
      skills: { vaultId: P, recordId: "pn", recordEntityUri: rec.entityUri, title: "Skill", valueKey: "skill", etag: '"sha256:0"', canEdit: true },
      interests: { vaultId: P, recordEntityUri: rec.entityUri, canEdit: true },
    });
  });

  it("no slot is called for a record with no address of its own (an optimistic row)", async () => {
    cardWorld();
    let called = 0;
    seam.address = () => ((called += 1), null);
    seam.employment = () => ((called += 1), null);
    seam.languages = () => ((called += 1), null);
    seam.skillsAndInterests = () => ((called += 1), null);
    const { rec, qc } = held(FACTS, { entityUri: undefined });
    render(tree(qc, shellOf(rec)));
    await ready();
    expect(called).toBe(0);
  });

  it("a read-only holder: the slots are told canEdit false", async () => {
    cardWorld();
    const seen: boolean[] = [];
    seam.address = (p) => (seen.push(p.canEdit), null);
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec, { writeGuard: { allowed: false, reason: "closed" } })));
    await ready();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen.every((x) => x === false)).toBe(true);
  });

  it("address and employment absent: nothing is drawn for them, and the skills section is the plain ContactRows", async () => {
    cardWorld();
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.queryByText("Storgata 1")).toBeNull();
    expect(screen.queryByText("Employment")).toBeNull();
    expect(screen.getByTestId("skill-rows")).toBeTruthy();
  });

  it("skills and interests absent but languages present: the plain skills section and the languages slot, in one block", async () => {
    cardWorld();
    seam.languages = () => <div data-testid="s-languages" />;
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    const slot = await screen.findByTestId("s-languages");
    expect(slot.closest("div.flex.flex-col.gap-4")?.querySelector('[data-testid="skill-row"]')).toBeTruthy();
  });

  it("languages given: the contact-language row is not drawn as a plain row; absent: it is, with its value", async () => {
    cardWorld();
    const a = held();
    const first = render(tree(a.qc, shellOf(a.rec)));
    await ready();
    expect(screen.getAllByText("Contact Language").length).toBeGreaterThan(0);
    first.unmount();
    seam.languages = () => <div data-testid="s-languages" />;
    const b = held();
    render(tree(b.qc, shellOf(b.rec)));
    await ready();
    await screen.findByTestId("s-languages");
    expect(screen.queryAllByText("Contact Language")).toEqual([]);
  });

  it("skills and interests given: it replaces the plain skills section and receives its props", async () => {
    cardWorld();
    seam.skillsAndInterests = (p) => <div data-testid="s-skills">{String(p.skills.served.values ? "has-values" : "no-values")}</div>;
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    expect((await screen.findByTestId("s-skills")).textContent).toBe("has-values");
    expect(screen.queryByTestId("skill-rows")).toBeNull();
  });
});

describe("the picture, the band and the attachments", () => {
  const withHolder = (rec: { id: string }) => shellOf(rec, { vaults: [HELD_VAULT] });

  it("the wide header gives the record picture slot the holder's vault, the person and an onSaved that reads the record again", async () => {
    cardWorld();
    let got: Parameters<NonNullable<typeof seam.recordPicture>>[0] | null = null;
    seam.recordPicture = (p) => ((got = p), <div data-testid="s-picture">{p.initials}</div>);
    const { rec, qc } = held({ ...FACTS, profilePhoto: "/files/pic1" });
    render(tree(qc, withHolder(rec)));
    await ready();
    await screen.findByTestId("s-picture");
    expect(got).toMatchObject({ person: { id: "pn", entityUri: rec.entityUri, name: "Tom Gilb", canEdit: true, photoRef: "/files/pic1" } });
    expect(got!.vault.vaultId).toBe(P);
    expect(got!.initials).toBe("TG");
    expect(typeof got!.onSaved).toBe("function");
  });

  it("no picture slot: the wide header still draws, with the initials", async () => {
    cardWorld();
    const { rec, qc } = held();
    render(tree(qc, withHolder(rec)));
    await ready();
    expect((await screen.findByTestId("contact-card-initials")).textContent).toBe("TG");
  });

  it("without the holder's vault in the shell's list there is no wide header: the band is drawn, with the host's icon and description", async () => {
    cardWorld();
    seam.bandIcon = (p) => <i data-testid="s-icon" className={p.className}>{p.typeName}</i>;
    seam.typeDescription = (p) => <b data-testid="s-desc">{p.typeUri}</b>;
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    expect(screen.queryByTestId("contact-shell-header")).toBeNull();
    const band = screen.getByTestId("record-header");
    expect(within(band).getByTestId("s-icon").textContent).toBe("Person");
    expect(within(band).getByTestId("s-icon").className).toMatch(/shrink-0/);
    expect(within(band).getByTestId("s-desc").textContent).toBe("t:Person");
    expect(within(band).getByTestId("card-edit")).toBeTruthy();
  });

  it("the band gives the picture slot a size and no shape (a kind that is not a person has no wide header)", async () => {
    cardWorld({ master: "hang" });
    let got: Parameters<NonNullable<typeof seam.recordPicture>>[0] | null = null;
    seam.recordPicture = (p) => ((got = p), <div data-testid="s-band-picture" />);
    const { rec, qc } = held({ ...FACTS, profilePhoto: "/files/pic1" });
    render(tree(qc, withHolder(rec)));
    await screen.findByTestId("s-band-picture");
    expect(got!.shape).toBeUndefined();
    expect(typeof got!.size).toBe("number");
    expect(got!.person.photoRef).toBe("/files/pic1");
    expect(within(screen.getByTestId("record-header")).getByTestId("s-band-picture")).toBeTruthy();
  });

  it("attachments: called with the record, the door and whether it may be written; not called for an optimistic record", async () => {
    cardWorld();
    let got: Parameters<NonNullable<typeof seam.attachments>>[0] | null = null;
    seam.attachments = (p) => ((got = p), <div data-testid="s-attach" />);
    const a = held();
    const first = render(tree(a.qc, shellOf(a.rec)));
    await ready();
    await screen.findByTestId("s-attach");
    expect(got).toMatchObject({ recordId: "pn", vaultId: P, recordEntityUri: a.rec.entityUri, canWrite: true });
    expect(screen.getByTestId("record-detail-attachments")).toBeTruthy();
    first.unmount();
    let called = 0;
    seam.attachments = () => ((called += 1), null);
    const temp = personRecord("temp:1", { givenName: "Tom", familyName: "Gilb" }, { servedKeys: undefined });
    const qc = newQc();
    putList(qc, P, [temp]);
    render(tree(qc, shellOf(temp)));
    await ready();
    expect(called).toBe(0);
    expect(screen.queryByTestId("record-detail-attachments")).toBeNull();
  });

  it("no attachments slot: nothing is drawn for them", async () => {
    cardWorld();
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    expect(screen.queryByTestId("record-detail-attachments")).toBeNull();
  });
});

describe("the vault that holds the record", () => {
  it("the host's holdingVaultOf wins; absent, the vault a create wrote into; absent, the door", async () => {
    cardWorld();
    const seen: (string | null)[] = [];
    seam.address = (p) => (seen.push(p.vaultId), null);
    seam.holdingVaultOf = () => "https://host.gilb.test/vault";
    const a = held();
    const first = render(tree(a.qc, shellOf(a.rec)));
    await ready();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(new Set(seen)).toEqual(new Set(["https://host.gilb.test/vault"]));
    first.unmount();
    seen.length = 0;
    seam.holdingVaultOf = () => null;
    const b = held();
    b.qc.setQueryData(["created-in-vault", "pn"], "https://made.gilb.test/vault");
    const second = render(tree(b.qc, shellOf(b.rec)));
    await ready();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(new Set(seen)).toEqual(new Set([P]));
    second.unmount();
  });
});
