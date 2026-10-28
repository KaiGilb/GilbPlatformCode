import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AMES, Frame, bonesFixture, makeWorld, part, sequence, SOL_ID } from "../test/fakeHost";

afterEach(() => cleanup());

const DUP = (tag: string) => `The tag "${tag}" is already used in this vault. Pick another.`;
const WRITES = ["tagUsedInVault", "createRecord", "invalidatePlanSearch", "prependPlanFind", "setFind", "invalidatePlanFind"];
const TEXT = "Wheel: A wheel.\n- Rim: The rim. <- Dr Ames\nAxle: An axle.";

async function openPaste(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Paste parts" }));
}
function paste(text: string) {
  fireEvent.change(screen.getByLabelText("Paste parts"), { target: { value: text } });
}
const previewLines = () => [...(document.querySelector("ul")?.querySelectorAll("li") ?? [])].map((li) => li.textContent);
const create = () => screen.getByRole("button", { name: /^Create \d+ parts?$/ }) as HTMLButtonElement;

describe("Paste parts: the preview", () => {
  it("shows each line as what it will become before anything is written", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste(`${TEXT}\nFeet: dup\nnot a part at all`);
    expect(previewLines()).toEqual(["Sol.Wheel A wheel.", "Sol.Wheel.Rim The rim.", "Sol.Axle An axle.", "Sol.Feet dup skipped", "not a part"]);
    expect(create().textContent).toBe("Create 3 parts");
    expect(create().disabled).toBe(false);
    expect(sequence(world, ["createRecord", "tagUsedInVault"])).toEqual([]);
  });

  it("says 'Create 1 part' for one, and disables the button when nothing can be created", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste("Wheel: A wheel.");
    expect(create().textContent).toBe("Create 1 part");
    paste("Feet: dup");
    expect(create().textContent).toBe("Create 0 parts");
    expect(create().disabled).toBe(true);
  });

  it("is refused for a card with no tag: it says so and focuses the Tag box, and the paste box does not open", async () => {
    const user = userEvent.setup();
    const rec = { ...makeWorld().world.record, facts: {}, served: { facts: {}, context: null, etag: '"s1"' } };
    const { world, host } = makeWorld({ record: rec });
    const notes: (string | null)[] = [];
    render(
      <Frame host={host} world={world} onNotice={(n) => notes.push(n)}>
        <input aria-label="Tag" />
      </Frame>,
    );
    await openPaste(user);
    expect(notes).toEqual(["Give this Solution a tag first, in the Tag box at the top."]);
    expect(document.activeElement).toBe(screen.getByLabelText("Tag"));
    expect(screen.queryByLabelText("Paste parts")).toBeNull();
  });

  it("Discard closes the box and forgets the text", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste(TEXT);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByLabelText("Paste parts")).toBeNull();
    await openPaste(user);
    expect((screen.getByLabelText("Paste parts") as HTMLTextAreaElement).value).toBe("");
  });

  it("a press outside while text is pasted does not discard it: it says the parts are not created yet", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste(TEXT);
    fireEvent.mouseDown(document.body);
    expect(screen.getByText("Not created yet — Create 3 parts or Discard")).toBeTruthy();
    expect((screen.getByLabelText("Paste parts") as HTMLTextAreaElement).value).toBe(TEXT);
  });

  it("a press outside an empty paste box closes it", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText("Paste parts")).toBeNull();
  });
});

describe("Paste parts: the writes", () => {
  it("checks every tag first, then writes the parts in the pasted order, each one prepended without a re-read, and re-reads each touched level once at the end", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await openPaste(user);
    paste(TEXT);
    await user.click(create());
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    expect(sequence(world, WRITES)).toEqual([
      'tagUsedInVault "PV" "Sol.Wheel"',
      'tagUsedInVault "PV" "Sol.Wheel.Rim"',
      'tagUsedInVault "PV" "Sol.Axle"',
      'createRecord "PV" "PV/t/SpecificationElement" {"unitTag":"Sol.Wheel","body":"A wheel.","partOf":{"@id":"PV/e/sol1"},"elementOrder":3} "Sol.Wheel"',
      'invalidatePlanSearch "PV"',
      'prependPlanFind "PV" "a:partOf" "sol1" "new1" {"members":["PV/e/new1"],"refresh":false}',
      'setFind "PV" "a:partOf" "new1"',
      'createRecord "PV" "PV/t/SpecificationElement" {"unitTag":"Sol.Wheel.Rim","body":"The rim.","partOf":{"@id":"PV/e/new1"},"elementOrder":1,"lineSources":[{"a:sourceOf":"a:body","a:source":"Dr Ames"}]} "Sol.Wheel.Rim"',
      'invalidatePlanSearch "PV"',
      'prependPlanFind "PV" "a:partOf" "new1" "new2" {"members":["PV/e/new2"],"refresh":false}',
      'setFind "PV" "a:partOf" "new2"',
      'createRecord "PV" "PV/t/SpecificationElement" {"unitTag":"Sol.Axle","body":"An axle.","partOf":{"@id":"PV/e/sol1"},"elementOrder":4} "Sol.Axle"',
      'invalidatePlanSearch "PV"',
      'prependPlanFind "PV" "a:partOf" "sol1" "new3" {"members":["PV/e/new3"],"refresh":false}',
      'setFind "PV" "a:partOf" "new3"',
      'invalidatePlanFind "PV" "a:partOf" "sol1" {"members":[]}',
      'invalidatePlanFind "PV" "a:partOf" "new1" {"members":[]}',
    ]);
    // Prepending shows a part at once and re-reads nothing here; the two re-reads are the end-of-paste ones.
    expect(world.counts.prepend).toBe(3);
    expect(world.counts.reRead).toBe(2);
    expect(notes.at(-1)).toBeNull();
    expect(screen.queryByLabelText("Paste parts")).toBeNull();
    await waitFor(() => expect([...document.querySelectorAll("[data-part]")].map((e) => e.getAttribute("data-part-tag"))).toContain("Sol.Wheel.Rim"));
  });

  it("each new part's own level is seeded empty only when the app has none yet, so the tree does not ask one find per part", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste("Wheel: A wheel.");
    await user.click(create());
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    const probes = sequence(world, ["getFind", "setFind"]).filter((l) => l.includes('"new1"'));
    expect(probes).toEqual(['getFind "PV" "a:partOf" "new1"', 'setFind "PV" "a:partOf" "new1"']);
  });

  it("the signed-in person is the source of a pasted part with text and no source of its own", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture(), self: { "@id": AMES } });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste(TEXT);
    await user.click(create());
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(3));
    const sources = world.callsOf("createRecord").map((c) => (c.args[2] as { lineSources?: unknown }).lineSources);
    expect(sources).toEqual([
      [{ "a:sourceOf": "a:body", "a:statedBy": { "@id": AMES } }],
      [{ "a:sourceOf": "a:body", "a:source": "Dr Ames" }],
      [{ "a:sourceOf": "a:body", "a:statedBy": { "@id": AMES } }],
    ]);
  });

  it("an Assumption: line makes the Assumption part first (one create), then its assumptions under it numbered from 1", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste("Assumption:\n- Weight: Light.\n- Floor: Flat.");
    await user.click(create());
    await waitFor(() => expect(world.callsOf("invalidatePlanFind").length).toBeGreaterThan(0));
    const creates = world.callsOf("createRecord").map((c) => ({ type: c.args[1], facts: c.args[2] }));
    expect(creates).toEqual([
      { type: `${"https://pv.example.test/base"}/t/Assumption`, facts: { unitTag: "Sol.Assumption", body: "", partOf: { "@id": "https://pv.example.test/base/e/sol1" }, elementOrder: 3 } },
      { type: `${"https://pv.example.test/base"}/t/Assumption`, facts: { unitTag: "Sol.Assumption.Weight", body: "Light.", partOf: { "@id": "https://pv.example.test/base/e/new1" }, elementOrder: 1 } },
      { type: `${"https://pv.example.test/base"}/t/Assumption`, facts: { unitTag: "Sol.Assumption.Floor", body: "Flat.", partOf: { "@id": "https://pv.example.test/base/e/new1" }, elementOrder: 2 } },
    ]);
    // Re-read once each: the card's level (the Assumption part sits on it) and the Assumption part's level.
    expect(sequence(world, ["invalidatePlanFind"])).toEqual(['invalidatePlanFind "PV" "a:partOf" "sol1" {"members":[]}', 'invalidatePlanFind "PV" "a:partOf" "new1" {"members":[]}']);
  });

  it("a part under an existing part is numbered after that part's children", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste("Bones: The leg.\n- Shin: The shin.");
    await user.click(create());
    // "Bones" is a tag the pool holds, so it is skipped; its child goes under the existing part, after Knee (2).
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(1));
    expect(world.callsOf("createRecord")[0]!.args[2]).toEqual({
      unitTag: "Sol.Bones.Shin",
      body: "The shin.",
      partOf: { "@id": "https://pv.example.test/base/e/bones" },
      elementOrder: 3,
    });
  });
});

describe("Paste parts: when a tag is taken or the check fails", () => {
  it("a tag the vault holds that the card does not know writes nothing, and the part is shown as skipped", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.server.set("elsewhere", part("elsewhere", "Sol.Wheel", "other", 1, "x"));
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste(TEXT);
    await user.click(create());
    await waitFor(() => expect(previewLines()[0]).toBe("Sol.Wheel A wheel. skipped"));
    expect(world.callsOf("createRecord")).toHaveLength(0);
    expect(previewLines()).toEqual(["Sol.Wheel A wheel. skipped", "Sol.Wheel.Rim The rim. not written: its parent is not a part here", "Sol.Axle An axle."]);
    // The lines under a skipped part are skipped with it; only Axle is left.
    expect(create().textContent).toBe("Create 1 part");
  });

  it("when the tags cannot be checked nothing is written and the box says so", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.failNext("tagUsedInVault", new Error("down"));
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste(TEXT);
    await user.click(create());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Could not check the tags — nothing was written.");
    expect(world.callsOf("createRecord")).toHaveLength(0);
    expect(world.callsOf("invalidatePlanFind")).toHaveLength(0);
  });

  it("a write that fails marks its line, keeps what was written, and re-reads the levels it touched", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.failNth("createRecord", 2, new Error("The vault said no"));
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste(TEXT);
    await user.click(create());
    expect(await screen.findByText("Line 2 was not written.")).toBeTruthy();
    expect(world.callsOf("createRecord")).toHaveLength(2);
    expect(world.server.has("new1")).toBe(true);
    expect(sequence(world, ["invalidatePlanFind"])).toEqual(['invalidatePlanFind "PV" "a:partOf" "sol1" {"members":[]}']);
    // The box stays open with the text, ready for Create again or Discard.
    expect((screen.getByLabelText("Paste parts") as HTMLTextAreaElement).value).toBe(TEXT);
  });

  it("a 409 from a write names the tag, how many were written, and where it stopped", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.failNth("createRecord", 2, Object.assign(new Error("exists"), { status: 409, tag: "Sol.Wheel.Rim" }));
    render(<Frame host={host} world={world} />);
    await openPaste(user);
    paste(TEXT);
    await user.click(create());
    expect(await screen.findByText(`${DUP("Sol.Wheel.Rim")} Written: 1 of 3. Stopped at Sol.Wheel.Rim.`)).toBeTruthy();
  });
});

describe("Paste parts on a level the host read only in part", () => {
  it("numbers the first pasted part from every stored child, read fresh", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 7, "w")] });
    render(<Frame host={host} world={world} />);
    act(() => world.cutLevel(SOL_ID, 2));
    await openPaste(user);
    paste("Axle: An axle.\nHub: A hub.");
    await user.click(create());
    await waitFor(() => expect(world.callsOf("createRecord")).toHaveLength(2));
    expect(world.callsOf("createRecord").map((c) => (c.args[2] as { elementOrder: number }).elementOrder)).toEqual([8, 9]);
    expect(world.callsOf("readMember").every((c) => c.args[1] === true)).toBe(true);
  });

  it("a level that cannot be read refuses the whole paste and writes nothing", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 7, "w")] });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    act(() => world.cutLevel(SOL_ID, 2));
    world.failNext("pageChildIds", new Error("down"));
    await openPaste(user);
    paste("Axle: An axle.");
    await user.click(create());
    await waitFor(() => expect(notes).toContain("Some parts at this level could not be read, so their order cannot be changed now. Try again."));
    expect(world.callsOf("createRecord")).toHaveLength(0);
  });
});
