// The keep list: a save of the card must never retract a fact the card does not edit. The four sections that are the host's (address, employment,
// languages, skills and interests) and the contact sections write their facts by their own writers; the record the card holds changes under a draft that
// is already being typed in. The save that follows must send the person's own edit and nothing that takes those facts away (a retraction is a `null`
// in the merge patch), whether the host draws the section (its slot) or not.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RecordDetail, ShellContext, seam } from "../test/app";
import { cardWorld, newQc, personRecord, putList, shellOf, P, type CardWorld } from "../test/cardWorld";

const BASE_FACTS = { givenName: "Tom", familyName: "Gilb" };
/** What the sections' own writers put on the record while the card is open. */
const LANDED = {
  postalAddress: "Storgata 1, Oslo",
  employment: "https://h.gilb.test/base/e/job1",
  skill: "https://ontology.platform.example.test/base/t/Nursing",
};
const LANDED_KEYS = ["a:postalAddress", "a:employment", "a:skill"];

function tree(qc: QueryClient, rec: { id: string }) {
  return (
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={shellOf(rec)}>
        <RecordDetail />
      </ShellContext.Provider>
    </QueryClientProvider>
  );
}
const ready = () => waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });

/** Type in the given name; while that edit waits, the sections' writers land `landed` on the record; then leave the field. Returns the card's last write. */
async function typeThenLand(w: CardWorld, landed: Record<string, unknown> = LANDED) {
  const rec = personRecord("pn", BASE_FACTS);
  const qc = newQc();
  putList(qc, P, [rec]);
  render(tree(qc, rec));
  await ready();
  await userEvent.click(screen.getByTestId("card-edit"));
  const box = screen.getByDisplayValue("Tom");
  await userEvent.clear(box);
  await userEvent.type(box, "Thomas");
  putList(qc, P, [personRecord("pn", { ...BASE_FACTS, ...landed }, { etag: '"sha256:7"' })]);
  await new Promise((r) => setTimeout(r, 40));
  await userEvent.tab();
  await waitFor(() => expect(w.writes.length).toBeGreaterThan(0), { timeout: 4000 });
  return w.writes[w.writes.length - 1]!;
}

function expectNothingTakenAway(sent: { body: Record<string, unknown> }, keys = LANDED_KEYS) {
  for (const k of keys) expect(sent.body[k], `${k} is not retracted`).not.toBeNull();
  expect(Object.entries(sent.body).filter(([, v]) => v === null).map(([k]) => k), "no fact is retracted").toEqual([]);
}

describe("a save of the card retracts none of the facts the sections landed while it was being typed in", () => {
  it("every slot absent: the save sends the name and takes nothing away", async () => {
    const w = cardWorld();
    const sent = await typeThenLand(w);
    expect(sent.body["a:givenName"]).toBe("Thomas");
    expectNothingTakenAway(sent);
    expect(sent.ifMatch).toBe('"sha256:0"');
  });

  it.each([
    ["renderAddress", () => (seam.address = () => <div data-testid="slot-address" />)],
    ["renderEmployment", () => (seam.employment = () => <div data-testid="slot-employment" />)],
    ["renderLanguages", () => (seam.languages = () => <div data-testid="slot-languages" />)],
    ["renderSkillsAndInterests", () => (seam.skillsAndInterests = () => <div data-testid="slot-skills" />)],
  ] as const)("only %s given: the same save takes nothing away", async (_name, give) => {
    const w = cardWorld();
    give();
    const sent = await typeThenLand(w);
    expect(sent.body["a:givenName"]).toBe("Thomas");
    expectNothingTakenAway(sent);
  });

  it("all four given: the same save takes nothing away", async () => {
    const w = cardWorld();
    seam.address = () => <div data-testid="slot-address" />;
    seam.employment = () => <div data-testid="slot-employment" />;
    seam.languages = () => <div data-testid="slot-languages" />;
    seam.skillsAndInterests = () => <div data-testid="slot-skills" />;
    const sent = await typeThenLand(w);
    expectNothingTakenAway(sent);
  });

  it("each section's key is kept on its own: the address, the employment edges and the skills", async () => {
    for (const key of ["postalAddress", "employment", "skill"] as const) {
      const w = cardWorld();
      const sent = await typeThenLand(w, { [key]: LANDED[key] });
      expect(sent.body[`a:${key}`], key).not.toBeNull();
      expectNothingTakenAway(sent, [`a:${key}`]);
      document.body.innerHTML = "";
    }
  });

  it("the link to the online card is not written back, and not retracted", async () => {
    const w = cardWorld();
    const sent = await typeThenLand(w, { sameAs: { "@id": "https://id.gilb.test/base/p/kari" } });
    expect(sent.body["a:sameAs"]).toBeUndefined();
    expectNothingTakenAway(sent, ["a:sameAs"]);
  });

  it("the retry after a 412 keeps them too", async () => {
    const w = cardWorld();
    let patches = 0;
    w.respond = (method, url) => {
      if (method === "PATCH") {
        patches += 1;
        return new Response("{}", { status: patches === 1 ? 412 : 200, headers: { "content-type": "application/json", etag: '"sha256:2"' } });
      }
      if (method === "GET" && url.endsWith("/lws/r/pn"))
        return new Response(JSON.stringify({ "@context": "https://www.w3.org/ns/lws/v1", "@id": "https://h.gilb.test/base/e/pn", "@type": "t:Person", name: "Tom Gilb", ...BASE_FACTS, ...LANDED }), {
          status: 200,
          headers: { "content-type": "application/json", etag: '"sha256:1"' },
        });
      return undefined;
    };
    const rec = personRecord("pn", BASE_FACTS);
    const qc = newQc();
    putList(qc, P, [rec]);
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = screen.getByDisplayValue("Tom");
    await userEvent.clear(box);
    await userEvent.type(box, "Thomas");
    // the sections' writers have landed their facts on the record the card holds, and they are stored unchanged when the 412 sends the card to read again
    putList(qc, P, [personRecord("pn", { ...BASE_FACTS, ...LANDED }, { etag: '"sha256:7"' })]);
    await new Promise((r) => setTimeout(r, 40));
    await userEvent.tab();
    await waitFor(() => expect(w.writes.length).toBe(2), { timeout: 5000 });
    expect(w.writes[0]!.ifMatch).toBe('"sha256:0"');
    expect(w.writes[1]!.ifMatch).toBe('"sha256:1"');
    expectNothingTakenAway(w.writes[0]!);
    expectNothingTakenAway(w.writes[1]!);
  });

  it("the contact language written by the languages section goes through the card's own save", async () => {
    const w = cardWorld();
    seam.languages = (p) => (
      <button type="button" data-testid="slot-languages" onClick={() => p.writeContact?.("sv")}>
        {p.contactTag}
      </button>
    );
    const rec = personRecord("pn", { ...BASE_FACTS, contactLanguage: "no" });
    const qc = newQc();
    putList(qc, P, [rec]);
    render(tree(qc, rec));
    const slot = await screen.findByTestId("slot-languages");
    expect(slot.textContent).toBe("no");
    await userEvent.click(slot);
    await waitFor(() => expect(w.writes.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(w.writes[w.writes.length - 1]!.body["a:contactLanguage"]).toBe("sv");
  });
});
