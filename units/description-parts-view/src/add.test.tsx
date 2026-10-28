import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ASSUMPTION_ELEMENT, ASSUMPTION_KEPT, ASSUMPTION_WARNING, KEYWORD_MESSAGE } from "@kaigilb/gilbplatformcode-description-parts-model";
import { AMES, Frame, PLAN_VAULT, SOL_ID, SOL_URI, bonesFixture, makeWorld, part, sequence, settle, solution, uriOf } from "../test/fakeHost";

afterEach(() => cleanup());

const NAMES = [
  "tagUsedInVault",
  "typeUriForVaultNamespace",
  "createRecord",
  "readRecord",
  "rememberRecord",
  "markFreshlyCreated",
  "storePlanRow",
  "invalidatePlanSearch",
  "prependPlanFind",
  "invalidatePlanFind",
];

async function openAdd(user: ReturnType<typeof userEvent.setup>, label = "+ Part") {
  await user.click(screen.getByRole("button", { name: label }));
}

async function type(user: ReturnType<typeof userEvent.setup>, keyword: string, text: string) {
  if (keyword) await user.type(screen.getByLabelText("Keyword"), keyword);
  if (text) await user.type(screen.getByLabelText("Text"), text);
}

describe("+ Part", () => {
  it("makes ONE record through the host, then stores it, drops the cached searches and shows it at the head of its level, in that order", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await openAdd(user);
    await type(user, "Wheel", "A wheel.");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("prependPlanFind")).toHaveLength(1));
    expect(sequence(world, NAMES)).toEqual([
      'tagUsedInVault "PV" "Sol.Wheel"',
      'typeUriForVaultNamespace "SpecificationElement" "PV"',
      'createRecord "PV" "PV/t/SpecificationElement" {"unitTag":"Sol.Wheel","body":"A wheel.","partOf":{"@id":"PV/e/sol1"},"elementOrder":3} "Sol.Wheel"',
      'readRecord "new1" "PV"',
      'rememberRecord "new1" "PV" "PV/t/SpecificationElement"',
      'markFreshlyCreated "new1"',
      'storePlanRow "PV" "new1" {"insert":true}',
      'invalidatePlanSearch "PV"',
      'prependPlanFind "PV" "a:partOf" "sol1" "new1" {"members":["PV/e/new1"]}',
    ]);
    // prepend is told neither to skip the re-read nor to make its own: the host does it. The view itself asks for no separate re-read.
    expect(world.callsOf("invalidatePlanFind")).toHaveLength(0);
    expect(world.counts.prepend).toBe(1);
    expect(world.counts.reRead).toBe(1);
    expect(notes.at(-1)).toBeNull();
    // The new part is on screen and the add row is closed.
    await waitFor(() => expect(document.querySelector('[data-part="new1"]')).not.toBeNull());
    expect(screen.queryByLabelText("Keyword")).toBeNull();
    expect(document.querySelector('[data-part="new1"]')!.getAttribute("data-part-tag")).toBe("Sol.Wheel");
  });

  it("numbers the new part one past the highest shown order, and a text-less part has no body fact", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    const facts = world.callsOf("createRecord")[0]!.args[2] as Record<string, unknown>;
    expect(facts).toEqual({ unitTag: "Sol.Wheel", body: "", partOf: { "@id": SOL_URI }, elementOrder: 3 });
  });

  it("Enter in the Keyword box adds, the same as the Add button", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
  });

  it("suggests a Keyword from the text until the Keyword has been typed in", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await user.type(screen.getByLabelText("Text"), "Wheel turns round");
    expect((screen.getByLabelText("Keyword") as HTMLInputElement).value).toBe("Wheel");
    await user.clear(screen.getByLabelText("Keyword"));
    await user.type(screen.getByLabelText("Keyword"), "Tyre");
    await user.type(screen.getByLabelText("Text"), " more");
    expect((screen.getByLabelText("Keyword") as HTMLInputElement).value).toBe("Tyre");
  });

  it("refuses a Keyword that is not letters starting with a capital, with the rule's own sentence, and writes nothing", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "wheel", "A wheel.");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(KEYWORD_MESSAGE)).toBeTruthy();
    expect(sequence(world, ["createRecord", "tagUsedInVault"])).toEqual([]);
    // A digit is refused the same way.
    await user.clear(screen.getByLabelText("Keyword"));
    await user.type(screen.getByLabelText("Keyword"), "Feet2");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(KEYWORD_MESSAGE)).toBeTruthy();
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("refuses the word Assumption at the top level, and says to use + Assumption", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Assumption", "x");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(ASSUMPTION_KEPT)).toBeTruthy();
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("refuses a tag the pool already holds without asking the host's vault", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Feet", "again");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText('The tag "Sol.Feet" is already used in this vault. Pick another.')).toBeTruthy();
    expect(world.callsOf("tagUsedInVault")).toHaveLength(0);
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("refuses a tag the vault holds that the pool does not, and writes nothing", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.server.set("elsewhere", part("elsewhere", "Sol.Wheel", "other", 1, "x"));
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "mine");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText('The tag "Sol.Wheel" is already used in this vault. Pick another.')).toBeTruthy();
    expect(sequence(world, ["tagUsedInVault"])).toEqual(['tagUsedInVault "PV" "Sol.Wheel"']);
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("a 409 from the create says the tag is taken and re-reads that one level with no members", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.failNext("createRecord", Object.assign(new Error("exists"), { status: 409, tag: "Sol.Wheel" }));
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "mine");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText('The tag "Sol.Wheel" is already used in this vault. Pick another.')).toBeTruthy();
    expect(sequence(world, ["invalidatePlanFind"])).toEqual(['invalidatePlanFind "PV" "a:partOf" "sol1" {"members":[]}']);
    // The add row stays open with what was typed.
    expect((screen.getByLabelText("Keyword") as HTMLInputElement).value).toBe("Wheel");
  });

  it("any other failure is reported through onNotice with its message, and the row stays", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.failNext("createRecord", new Error("The vault said no"));
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await openAdd(user);
    await type(user, "Wheel", "mine");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(notes).toContain("The vault said no"));
    expect(screen.getByLabelText("Keyword")).toBeTruthy();
    expect(world.callsOf("prependPlanFind")).toHaveLength(0);
    // And the Add button works again.
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a card with no tag is told to give it one first, and the Tag box is focused", async () => {
    const user = userEvent.setup();
    const rec = solution({ facts: {}, served: { facts: {}, context: null, etag: '"s1"' } });
    const { world, host } = makeWorld({ record: rec });
    const notes: (string | null)[] = [];
    render(
      <Frame host={host} world={world} onNotice={(n) => notes.push(n)}>
        <input aria-label="Tag" />
      </Frame>,
    );
    await openAdd(user);
    await type(user, "Wheel", "mine");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(notes).toContain("Give this Solution a tag first, in the Tag box at the top.");
    expect(document.activeElement).toBe(screen.getByLabelText("Tag"));
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("a card whose address was not read says so and writes nothing", async () => {
    const user = userEvent.setup();
    const rec = solution({ entityUri: undefined });
    const { world, host } = makeWorld({ record: rec });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await openAdd(user);
    await type(user, "Wheel", "mine");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(notes).toContain("This record's address was not read, so it was not linked.");
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });
});

describe("the source of a new part", () => {
  it("is the signed-in person, when known and the part has text", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture(), self: { "@id": AMES } });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "A wheel.");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    const facts = world.callsOf("createRecord")[0]!.args[2] as Record<string, unknown>;
    expect(facts.lineSources).toEqual([{ "a:sourceOf": "a:body", "a:statedBy": { "@id": AMES } }]);
  });

  it("is nothing when the person is not known, or the part has no text", async () => {
    const user = userEvent.setup();
    const a = makeWorld({ parts: bonesFixture() });
    render(<Frame host={a.host} world={a.world} />);
    await openAdd(user);
    await type(user, "Wheel", "A wheel.");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(a.world.callsOf("createRecord")).toHaveLength(1));
    expect("lineSources" in (a.world.callsOf("createRecord")[0]!.args[2] as object)).toBe(false);
    cleanup();
    const b = makeWorld({ parts: bonesFixture(), self: { "@id": AMES } });
    render(<Frame host={b.host} world={b.world} />);
    await openAdd(user);
    await type(user, "Wheel", "");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(b.world.callsOf("createRecord")).toHaveLength(1));
    expect("lineSources" in (b.world.callsOf("createRecord")[0]!.args[2] as object)).toBe(false);
  });

  it("is the latest person the host gave at the time of the write, not the one at the first render", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "A wheel.");
    act(() => world.setSelf({ "@id": AMES }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    expect((world.callsOf("createRecord")[0]!.args[2] as { lineSources: unknown }).lineSources).toEqual([{ "a:sourceOf": "a:body", "a:statedBy": { "@id": AMES } }]);
  });
});

describe("+ Sub-part", () => {
  it("is offered on an open part in reading mode, and makes a part under it with the parent's tag and the next order", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    await user.click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    await user.click(screen.getByRole("button", { name: "+ Sub-part" }));
    await type(user, "Shin", "The shin.");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    const call = world.callsOf("createRecord")[0]!;
    expect(call.args[2]).toEqual({ unitTag: "Sol.Bones.Shin", body: "The shin.", partOf: { "@id": uriOf("bones") }, elementOrder: 3 });
    expect(world.callsOf("prependPlanFind")[0]!.args.slice(0, 4)).toEqual([PLAN_VAULT, "a:partOf", "bones", "new1"]);
  });

  it("is not offered in Edit, and not on a part that is not open", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    expect(screen.queryByRole("button", { name: "+ Sub-part" })).toBeNull();
    cleanup();
    const second = makeWorld({ parts: bonesFixture() });
    render(<Frame host={second.host} world={second.world} editing={false} />);
    expect(screen.queryByRole("button", { name: "+ Sub-part" })).toBeNull();
  });

  it("a sub-part may repeat a Keyword used at another level, since the tag differs", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} editing={false} />);
    await user.click(screen.getByRole("button", { name: "The feet touch the ground." }));
    await user.click(screen.getByRole("button", { name: "+ Sub-part" }));
    await type(user, "Hip", "Another hip.");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    expect((world.callsOf("createRecord")[0]!.args[2] as { unitTag: string }).unitTag).toBe("Sol.Feet.Hip");
  });
});

describe("+ Assumption", () => {
  it("makes the Assumption part first when there is none, then the assumption under it numbered 1; both tags are checked before any write", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user, "+ Assumption");
    await type(user, "Weight", "The walker weighs under 120 kg.");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("prependPlanFind")).toHaveLength(2));
    expect(sequence(world, ["tagUsedInVault", "typeUriForVaultNamespace", "createRecord", "prependPlanFind"])).toEqual([
      'tagUsedInVault "PV" "Sol.Assumption"',
      'tagUsedInVault "PV" "Sol.Assumption.Weight"',
      'typeUriForVaultNamespace "Assumption" "PV"',
      'createRecord "PV" "PV/t/Assumption" {"unitTag":"Sol.Assumption","body":"","partOf":{"@id":"PV/e/sol1"},"elementOrder":3} "Sol.Assumption"',
      'prependPlanFind "PV" "a:partOf" "sol1" "new1" {"members":["PV/e/new1"]}',
      'typeUriForVaultNamespace "Assumption" "PV"',
      'createRecord "PV" "PV/t/Assumption" {"unitTag":"Sol.Assumption.Weight","body":"The walker weighs under 120 kg.","partOf":{"@id":"PV/e/new1"},"elementOrder":1} "Sol.Assumption.Weight"',
      'prependPlanFind "PV" "a:partOf" "new1" "new2" {"members":["PV/e/new2"]}',
    ]);
  });

  it("writes nothing if the second tag is taken, so no empty Assumption part is left behind", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.server.set("elsewhere", part("elsewhere", "Sol.Assumption.Weight", "other", 1, "x"));
    render(<Frame host={host} world={world} />);
    await openAdd(user, "+ Assumption");
    await type(user, "Weight", "x");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText('The tag "Sol.Assumption.Weight" is already used in this vault. Pick another.')).toBeTruthy();
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("adds under an Assumption part that exists, numbered after its children, with no new parent", async () => {
    const user = userEvent.setup();
    const ASSUMPTION = { type: `${PLAN_VAULT}/t/Assumption` };
    const { world, host } = makeWorld({
      parts: [...bonesFixture(), part("assume", "Sol.Assumption", SOL_ID, 3, "", ASSUMPTION), part("floor", "Sol.Assumption.Floor", "assume", 1, "Flat.", ASSUMPTION)],
    });
    render(<Frame host={host} world={world} />);
    await openAdd(user, "+ Assumption");
    await type(user, "Weight", "Light.");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    expect(world.callsOf("createRecord")[0]!.args[2]).toEqual({ unitTag: "Sol.Assumption.Weight", body: "Light.", partOf: { "@id": uriOf("assume") }, elementOrder: 2 });
    expect(sequence(world, ["tagUsedInVault"])).toEqual(['tagUsedInVault "PV" "Sol.Assumption.Weight"']);
  });

  it("refuses when a part that is not an assumption already has the tag Assumption", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: [...bonesFixture(), part("assume", "Sol.Assumption", SOL_ID, 3, "plain")] });
    render(<Frame host={host} world={world} />);
    await openAdd(user, "+ Assumption");
    await type(user, "Weight", "x");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(ASSUMPTION_ELEMENT)).toBeTruthy();
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("shows the assumption warning while the text hedges, and keeps it after the assumption is saved", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user, "+ Assumption");
    await type(user, "Weight", "It may be light");
    expect(screen.getByText(ASSUMPTION_WARNING)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(2));
    await settle();
    expect(screen.getByText(ASSUMPTION_WARNING)).toBeTruthy();
  });
});

describe("a level the host read only in part", () => {
  it("numbers the new part from every stored child, read fresh, not from the parts drawn", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 7, "w")] });
    render(<Frame host={host} world={world} />);
    act(() => world.cutLevel(SOL_ID, 2));
    await openAdd(user);
    await type(user, "Axle", "x");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    expect((world.callsOf("createRecord")[0]!.args[2] as { elementOrder: number }).elementOrder).toBe(8);
    // The level was read through the host's level members, with fresh reads.
    expect(world.callsOf("readMember").every((c) => c.args[1] === true)).toBe(true);
    expect(world.callsOf("readMember").length).toBe(3);
  });

  it("a level that cannot be read refuses the add with the level's own sentence and writes nothing", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 7, "w")] });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    act(() => world.cutLevel(SOL_ID, 2));
    world.failNext("pageChildIds", new Error("down"));
    await openAdd(user);
    await type(user, "Axle", "x");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(notes).toContain("Some parts at this level could not be read, so their order cannot be changed now. Try again."));
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });
});

describe("leaving the add row", () => {
  it("Escape with something typed asks to discard; Keep closes the question, Discard closes the row", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "");
    await user.keyboard("{Escape}");
    expect(screen.getByText("Discard what you typed?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText("Discard what you typed?")).toBeNull();
    expect((screen.getByLabelText("Keyword") as HTMLInputElement).value).toBe("Wheel");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByLabelText("Keyword")).toBeNull();
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("Escape with nothing typed asks nothing: the card leaves Edit and the empty row goes with it", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Discard what you typed?")).toBeNull();
    expect(screen.getByTestId("card-mode-root").getAttribute("data-card-mode")).toBe("presentation");
    expect(screen.queryByLabelText("Keyword")).toBeNull();
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });

  it("Escape is left alone while a modal dialog is open", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "");
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    try {
      fireEvent.keyDown(screen.getByLabelText("Keyword"), { key: "Escape" });
      expect(screen.queryByText("Discard what you typed?")).toBeNull();
    } finally {
      modal.remove();
    }
  });

  it("a press outside an empty add row closes it; a press inside it or on a help button does not", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    fireEvent.mouseDown(screen.getByLabelText("Keyword"));
    expect(screen.getByLabelText("Keyword")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Help: + Part" }));
    expect(screen.getByLabelText("Keyword")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText("Keyword")).toBeNull();
  });

  it("a press outside a row with a valid Keyword saves it; with an invalid one it shows the rule and stays", async () => {
    const user = userEvent.setup();
    const a = makeWorld({ parts: bonesFixture() });
    render(<Frame host={a.host} world={a.world} />);
    await openAdd(user);
    await type(user, "Wheel", "A wheel.");
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(a.world.callsOf("createRecord")).toHaveLength(1));
    cleanup();
    const b = makeWorld({ parts: bonesFixture() });
    render(<Frame host={b.host} world={b.world} />);
    await openAdd(user);
    await type(user, "wheel", "A wheel.");
    fireEvent.mouseDown(document.body);
    expect(screen.getByText(KEYWORD_MESSAGE)).toBeTruthy();
    expect(b.world.callsOf("createRecord")).toHaveLength(0);
  });

  it("a press inside an open layer (a dialog) does not close the row", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    const layer = document.createElement("div");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    document.body.appendChild(layer);
    try {
      fireEvent.mouseDown(layer);
      expect(screen.getByLabelText("Keyword")).toBeTruthy();
    } finally {
      layer.remove();
    }
  });

  it("Discard closes the row and clears what was typed", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "x");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByLabelText("Keyword")).toBeNull();
    await openAdd(user);
    expect((screen.getByLabelText("Keyword") as HTMLInputElement).value).toBe("");
  });

  it("pressing another + button while a valid part is typed saves that part first (the press is outside the row)", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openAdd(user);
    await type(user, "Wheel", "");
    await user.click(screen.getByRole("button", { name: "+ Assumption" }));
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    expect((world.callsOf("createRecord")[0]!.args[2] as { unitTag: string }).unitTag).toBe("Sol.Wheel");
  });
});
