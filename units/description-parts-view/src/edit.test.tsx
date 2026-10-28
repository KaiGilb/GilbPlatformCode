import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AMES, Frame, PLAN_VAULT, SCREEN, SOL_ID, bonesFixture, makeWorld, part, sequence, settle, uriOf } from "../test/fakeHost";

afterEach(() => cleanup());

const CONFLICT_NOTICE = "Bones changed elsewhere. The card now shows the latest; your change was not saved.";
const VERSION_UNREAD = "This record's version could not be read, so your change was not saved. Reload and try again.";

async function editBody(user: ReturnType<typeof userEvent.setup>, was: string, label: string, text: string) {
  await user.click(screen.getByRole("button", { name: was }));
  const box = screen.getByLabelText(`Edit ${label}`);
  await user.clear(box);
  if (text) await user.type(box, text);
  fireEvent.blur(box);
}

describe("editing the text of a part", () => {
  it("writes ONE patch of the body, with the version the part has as If-Match, then stores the saved row, in that order", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Bones are many.");
    await waitFor(() => expect(world.callsOf("patchPlanFindRows")).toHaveLength(1));
    expect(sequence(world, ["ensureEtagUnchanged", "patchRecord", "storePlanRow", "setRecordRead", "patchPlanFindRows", "reconcileAfterConflict"])).toEqual([
      'ensureEtagUnchanged "PV" "bones" "\\"bones-1\\""',
      'patchRecord "bones" {"body":"Bones are many."} "PV/e/bones" {"at":"PV/e/bones","servedKeys":["unitTag","partOf","elementOrder","body"]} {"ifMatch":"\\"bones-1\\""}',
      'storePlanRow "PV" "bones" undefined',
      'setRecordRead "bones" "PV/e/bones"',
      'patchPlanFindRows "PV" "bones"',
    ]);
    expect(notes).toEqual([]);
    expect(world.server.get("bones")!.facts.body).toBe("Bones are many.");
    // The saved text is on the card.
    await waitFor(() => expect(screen.getByRole("button", { name: "Bones are many." })).toBeTruthy());
  });

  it("asks the host for the newest copy with the SCREEN vault first (the text is saved from it) and the plan vault second (the patch is built from it)", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Changed");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(world.callsOf("liveRow").map((c) => c.args[0])).toEqual([SCREEN, PLAN_VAULT]);
  });

  it("writes nothing when the text did not change", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    fireEvent.blur(screen.getByLabelText("Edit Bones"));
    await settle();
    expect(world.callsOf("patchRecord")).toHaveLength(0);
    expect(world.callsOf("ensureEtagUnchanged")).toHaveLength(0);
  });

  it("an emptied text is written as null, which removes the fact", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(world.callsOf("patchRecord")[0]!.args[1]).toEqual({ body: null });
  });

  it("a part with no served keys is patched with an undefined source (five arguments)", async () => {
    const user = userEvent.setup();
    const bare = bonesFixture();
    bare[0] = { ...bare[0]!, servedKeys: [] };
    const { world, host } = makeWorld({ parts: bare });
    render(<Frame host={host} world={world} editing={false} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Changed");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    const args = world.callsOf("patchRecord")[0]!.args;
    expect(args).toHaveLength(5);
    expect(args[3]).toBeUndefined();
    expect(args[4]).toEqual({ ifMatch: '"bones-1"' });
  });

  it("the new text is the signed-in person's: they become its source in the same write", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture(), self: { "@id": AMES } });
    render(<Frame host={host} world={world} editing={false} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Changed");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(world.callsOf("patchRecord")[0]!.args[1]).toEqual({
      body: "Changed",
      lineSources: [{ "a:sourceOf": "a:body", "a:statedBy": { "@id": AMES } }],
    });
  });

  it("a part already sourced to that person is not stamped again", async () => {
    const user = userEvent.setup();
    const sourced = bonesFixture();
    sourced[0] = part("bones", "Sol.Bones", SOL_ID, 1, "The leg has 26 bones.", { sources: [{ "a:sourceOf": "a:body", "a:statedBy": { "@id": AMES } }] });
    const { world, host } = makeWorld({ parts: sourced, self: { "@id": AMES } });
    render(<Frame host={host} world={world} editing={false} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Changed");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(world.callsOf("patchRecord")[0]!.args[1]).toEqual({ body: "Changed" });
  });

  it("a source the person chose for this part is kept while its editor stays open: Tab into the source box saves the text without stamping", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture(), self: { "@id": AMES } });
    render(<Frame host={host} world={world} editing={false} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    await user.type(screen.getByLabelText("Bones source"), "Dr Brown");
    await user.click(await screen.findByRole("button", { name: 'Use "Dr Brown" as text' }));
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(world.callsOf("patchRecord")[0]!.args[1]).toEqual({ lineSources: [{ "a:sourceOf": "a:body", "a:source": "Dr Brown" }] });
    const box = screen.getByLabelText("Edit Bones");
    await user.clear(box);
    await user.type(box, "Changed");
    await user.tab();
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(2));
    expect(world.callsOf("patchRecord")[1]!.args[1]).toEqual({ body: "Changed" });
    expect(screen.getByLabelText("Edit Bones")).toBeTruthy();
  });

  it("the choice ends when the editor closes: a text saved by leaving the editor is stamped with the person again", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture(), self: { "@id": AMES } });
    render(<Frame host={host} world={world} editing={false} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    await user.type(screen.getByLabelText("Bones source"), "Dr Brown");
    await user.click(await screen.findByRole("button", { name: 'Use "Dr Brown" as text' }));
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    const box = screen.getByLabelText("Edit Bones");
    await user.clear(box);
    await user.type(box, "Changed");
    fireEvent.blur(box);
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(2));
    expect(world.callsOf("patchRecord")[1]!.args[1]).toEqual({
      body: "Changed",
      lineSources: [{ "a:sourceOf": "a:body", "a:statedBy": { "@id": AMES } }],
    });
  });
});

describe("editing the source of a part", () => {
  it("writes the source with the same checks as a text, one patch of the line sources", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    await user.type(screen.getByLabelText("Bones source"), "Dr Brown");
    await user.click(await screen.findByRole("button", { name: 'Use "Dr Brown" as text' }));
    await waitFor(() => expect(world.callsOf("patchPlanFindRows")).toHaveLength(1));
    expect(sequence(world, ["liveRow", "ensureEtagUnchanged", "patchRecord"])).toEqual([
      'liveRow "https://v.example.test/base" "bones"',
      'liveRow "PV" "bones"',
      'ensureEtagUnchanged "PV" "bones" "\\"bones-1\\""',
      'patchRecord "bones" {"lineSources":[{"a:sourceOf":"a:body","a:source":"Dr Brown"}]} "PV/e/bones" {"at":"PV/e/bones","servedKeys":["unitTag","partOf","elementOrder","body"]} {"ifMatch":"\\"bones-1\\""}',
    ]);
  });
});

describe("when the part changed under the person", () => {
  it("a version conflict from the write: the latest is read and shown, the level is re-read, ONE notice says so, and the editor closes", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    world.serverPatch("bones", { body: "Changed elsewhere" }, { body: "Changed elsewhere" }, '"bones-9"');
    await editBody(user, "The leg has 26 bones.", "Bones", "Mine");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(sequence(world, ["patchRecord", "reconcileAfterConflict", "patchPlanFindRows", "invalidatePlanFind", "storePlanRow", "setRecordRead"])).toEqual([
      'patchRecord "bones" {"body":"Mine"} "PV/e/bones" {"at":"PV/e/bones","servedKeys":["unitTag","partOf","elementOrder","body"]} {"ifMatch":"\\"bones-1\\""}',
      'reconcileAfterConflict "PV" "bones"',
      'patchPlanFindRows "PV" "bones"',
      'invalidatePlanFind "PV" "a:partOf" "sol1" undefined',
    ]);
    expect(notes).toEqual([CONFLICT_NOTICE]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Changed elsewhere" })).toBeTruthy());
    expect(screen.queryByLabelText("Edit Bones")).toBeNull();
  });

  it("the level that is re-read is the part's own parent", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    world.serverPatch("hip", { body: "Elsewhere" }, { body: "Elsewhere" }, '"hip-9"');
    await editBody(user, "The hip carries the weight.", "Hip", "Mine");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(world.callsOf("invalidatePlanFind")[0]!.args.slice(0, 3)).toEqual([PLAN_VAULT, "a:partOf", "bones"]);
  });

  it("a part with no version in the app is read first; if it changed meanwhile nothing is written and the same notice is shown", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.setClientEtag("bones", null);
    world.serverPatch("bones", { body: "Changed elsewhere" }, { body: "Changed elsewhere" }, '"bones-9"');
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Mine");
    await waitFor(() => expect(notes).toEqual([CONFLICT_NOTICE]));
    expect(world.callsOf("patchRecord")).toHaveLength(0);
    expect(world.callsOf("ensureEtagUnchanged")[0]!.args[2]).toBeNull();
    expect(world.callsOf("patchPlanFindRows")).toHaveLength(1);
    expect(world.callsOf("invalidatePlanFind")).toHaveLength(1);
  });

  it("a part with no version in the app, unchanged in the vault, is written with the version just read", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.setClientEtag("bones", null);
    render(<Frame host={host} world={world} editing={false} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Mine");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(world.callsOf("patchRecord")[0]!.args[4]).toEqual({ ifMatch: '"bones-1"' });
  });

  it("a part whose version cannot be read at all is not written, and the person is told to reload", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.setClientEtag("bones", null);
    world.serverPatch("bones", {}, {}, null as unknown as string);
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Mine");
    await waitFor(() => expect(notes.length).toBeGreaterThan(0));
    expect(notes[0]).toBe(VERSION_UNREAD);
    expect(world.callsOf("patchRecord")).toHaveLength(0);
  });

  it("any other failure of the write is reported with its own message", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.failNext("patchRecord", new Error("The vault is down"));
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Mine");
    await waitFor(() => expect(notes).toEqual(["The vault is down"]));
    expect(world.callsOf("reconcileAfterConflict")).toHaveLength(0);
  });

  it("an error that the host's isConflict does not recognise is not a conflict, even with status 412", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.failNext("patchRecord", Object.assign(new Error("precondition failed"), { status: 412 }));
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    await editBody(user, "The leg has 26 bones.", "Bones", "Mine");
    await waitFor(() => expect(notes).toEqual(["precondition failed"]));
    expect(world.callsOf("reconcileAfterConflict")).toHaveLength(0);
  });
});

describe("a part whose version moved while its editor was open", () => {
  it("the text is checked against the vault before it is written: a change elsewhere stops it", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    // Behind the editor: the vault changes the text, and the app learns only the new version.
    world.serverPatch("bones", { body: "Changed elsewhere" }, { body: "Changed elsewhere" }, '"bones-9"');
    act(() => world.setClientEtag("bones", '"bones-9"'));
    const box = screen.getByLabelText("Edit Bones");
    await user.clear(box);
    await user.type(box, "Mine");
    // Tab into the source box keeps the editor open, so the version the editor started from is still known.
    await user.tab();
    await waitFor(() => expect(notes).toEqual([CONFLICT_NOTICE]));
    expect(world.callsOf("patchRecord")).toHaveLength(0);
    // The check was a fresh read: the row was handed over with its version blanked.
    expect(world.callsOf("ensureEtagUnchanged")[0]!.args[2]).toBeNull();
  });

  it("when the text did not change in the vault, the write goes through with the version just read", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    world.serverPatch("bones", { elementOrder: "5" }, { elementOrder: 5 }, '"bones-9"');
    act(() => world.setClientEtag("bones", '"bones-9"'));
    const box = screen.getByLabelText("Edit Bones");
    await user.clear(box);
    await user.type(box, "Mine");
    await user.tab();
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(world.callsOf("patchRecord")[0]!.args[4]).toEqual({ ifMatch: '"bones-9"' });
    expect(world.callsOf("ensureEtagUnchanged")[0]!.args[2]).toBeNull();
  });

  it("a text saved by leaving the editor has lost that starting version, so it is written with the newest version the app holds, unchecked", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    world.serverPatch("bones", { body: "Changed elsewhere" }, { body: "Changed elsewhere" }, '"bones-9"');
    act(() => world.setClientEtag("bones", '"bones-9"'));
    const box = screen.getByLabelText("Edit Bones");
    await user.clear(box);
    await user.type(box, "Mine");
    fireEvent.blur(box);
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(world.callsOf("ensureEtagUnchanged")[0]!.args[2]).toBe('"bones-9"');
    expect(world.callsOf("patchRecord")[0]!.args[4]).toEqual({ ifMatch: '"bones-9"' });
  });

  it("the source is checked the same way", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    world.serverPatch("bones", {}, { lineSources: [{ "a:sourceOf": "a:body", "a:source": "Someone else" }] }, '"bones-9"');
    act(() => world.setClientEtag("bones", '"bones-9"'));
    await user.type(screen.getByLabelText("Bones source"), "Dr Brown");
    await user.click(await screen.findByRole("button", { name: 'Use "Dr Brown" as text' }));
    await waitFor(() => expect(notes).toEqual([CONFLICT_NOTICE]));
    expect(world.callsOf("patchRecord")).toHaveLength(0);
  });
});

describe("one queue for every write", () => {
  it("a second save starts only after the first has settled", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    const hold = world.hold("patchRecord");
    await editBody(user, "The leg has 26 bones.", "Bones", "First");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    await editBody(user, "The feet touch the ground.", "Feet", "Second");
    await settle(60);
    // The second is queued: it has not even checked the version.
    expect(sequence(world, ["ensureEtagUnchanged", "patchRecord"]).map((l) => l.split(" ").slice(0, 2).join(" "))).toEqual([
      "ensureEtagUnchanged \"PV\"",
      "patchRecord \"bones\"",
    ]);
    expect(world.callsOf("patchRecord")).toHaveLength(1);
    world.holds.delete("patchRecord");
    act(() => hold.release());
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(2));
    expect(world.callsOf("patchRecord").map((c) => c.args[0])).toEqual(["bones", "feet"]);
    const names = sequence(world, ["ensureEtagUnchanged", "patchRecord"]).map((l) => l.split(" ").slice(0, 3).join(" "));
    expect(names).toEqual(['ensureEtagUnchanged "PV" "bones"', 'patchRecord "bones" {"body":"First"}', 'ensureEtagUnchanged "PV" "feet"', 'patchRecord "feet" {"body":"Second"}']);
  });

  it("a failed first write does not stop the second", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} editing={false} onNotice={(n) => notes.push(n)} />);
    const hold = world.hold("patchRecord");
    world.failNext("patchRecord", new Error("first failed"));
    await editBody(user, "The leg has 26 bones.", "Bones", "First");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    await editBody(user, "The feet touch the ground.", "Feet", "Second");
    world.holds.delete("patchRecord");
    act(() => hold.release());
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(2));
    expect(notes).toEqual(["first failed"]);
    expect(world.server.get("feet")!.facts.body).toBe("Second");
  });

  it("pressing Enter twice in the add row creates once: the second runs after the first and finds the tag taken", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await user.click(screen.getByRole("button", { name: "+ Part" }));
    await user.type(screen.getByLabelText("Keyword"), "Wheel");
    const hold = world.hold("createRecord");
    await user.keyboard("{Enter}{Enter}");
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    await settle(40);
    expect(world.callsOf("tagUsedInVault")).toHaveLength(1);
    world.holds.delete("createRecord");
    act(() => hold.release());
    await waitFor(() => expect(world.callsOf("tagUsedInVault").length).toBeGreaterThanOrEqual(2));
    await settle(40);
    expect(world.callsOf("createRecord")).toHaveLength(1);
    void uriOf;
  });
});
