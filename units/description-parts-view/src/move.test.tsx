import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Frame, PLAN_VAULT, SOL_ID, bonesFixture, makeWorld, part, sequence, settle } from "../test/fakeHost";

afterEach(() => cleanup());

const WRITES = ["patchRecord", "dropPlanFind", "prependPlanFind", "invalidatePlanFind"];
const order = () => [...document.querySelectorAll("[data-part]")].map((e) => e.getAttribute("data-part"));
const click = (name: string) => userEvent.setup().click(screen.getByRole("button", { name }));
const VERSION_UNREAD = "This record's version could not be read, so your change was not saved. Reload and try again.";

describe("up and down", () => {
  it("one place up swaps the two stored orders: the moved part first, then its neighbour, then ONE re-read of the level with both as members", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await click("Move Feet up");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(sequence(world, WRITES).map((l) => l.replace(/ \{"at".*$/, ""))).toEqual([
      'patchRecord "feet" {"elementOrder":1} "PV/e/feet"',
      'patchRecord "bones" {"elementOrder":2} "PV/e/bones"',
      'invalidatePlanFind "PV" "a:partOf" "sol1" {"members":["PV/e/feet","PV/e/bones"]}',
    ]);
    // Within one level the part keeps its parent, so no find is dropped from or prepended to.
    expect(world.counts.prepend + world.counts.drop).toBe(0);
    expect(notes.at(-1)).toBeNull();
    await waitFor(() => expect(order()).toEqual(["feet", "bones", "hip", "knee"]));
  });

  it("one place down is the same plan the other way", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await click("Move Bones down");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(world.callsOf("patchRecord").map((c) => [c.args[0], c.args[1]])).toEqual([
      ["bones", { elementOrder: 2 }],
      ["feet", { elementOrder: 1 }],
    ]);
    await waitFor(() => expect(order()).toEqual(["feet", "bones", "hip", "knee"]));
  });

  it("each write is checked for a newer version, with the version the part has as If-Match", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await click("Move Feet up");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(world.callsOf("patchRecord").map((c) => c.args[4])).toEqual([{ ifMatch: '"feet-1"' }, { ifMatch: '"bones-1"' }]);
    expect(sequence(world, ["ensureEtagUnchanged", "patchRecord"]).map((l) => l.split(" ")[0])).toEqual(["ensureEtagUnchanged", "patchRecord", "ensureEtagUnchanged", "patchRecord"]);
  });

  it("pressing the arrow from the keyboard says where the part landed and puts the focus back on a button that still works", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    screen.getByRole("button", { name: "Move Feet up" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.querySelector("[data-tree-status]")!.textContent).toBe("Moved Feet up. Now 1 of 2."));
    // Feet is first now, so up is disabled: the focus goes to the opposite arrow.
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Move Feet down"));
  });

  it("a mouse click moves without announcing", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await click("Move Feet up");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    await settle();
    expect(document.querySelector("[data-tree-status]")!.textContent).toBe("");
  });
});

describe("where the focus goes after a keyboard move", () => {
  const three = () => [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 3, "A wheel.")];
  const focusLabel = () => (document.activeElement as HTMLElement).getAttribute("aria-label");
  const status = () => document.querySelector("[data-tree-status]")!.textContent;

  it("stays on the same arrow while it still works: Wheel up from last stays on up", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: three() });
    render(<Frame host={host} world={world} />);
    screen.getByRole("button", { name: "Move Wheel up" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(status()).toBe("Moved Wheel up. Now 2 of 3."));
    await waitFor(() => expect(focusLabel()).toBe("Move Wheel up"));
  });

  it("down stays on down while it still works", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: three() });
    render(<Frame host={host} world={world} />);
    screen.getByRole("button", { name: "Move Bones down" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(status()).toBe("Moved Bones down. Now 2 of 3."));
    await waitFor(() => expect(focusLabel()).toBe("Move Bones down"));
  });

  it("in, with nothing above it now to go under, goes to the 'out' arrow", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    screen.getByRole("button", { name: "Move Knee in under Hip" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(status()).toBe("Moved Knee in. Now 1 of 1."));
    await waitFor(() => expect(focusLabel()).toBe("Move Knee out a level"));
  });

  it("out, now last at the top level, goes to the 'in' arrow", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: [part("a", "Sol.A", SOL_ID, 1, "a"), part("b", "Sol.A.B", "a", 1, "b")] });
    render(<Frame host={host} world={world} />);
    screen.getByRole("button", { name: "Move B out a level" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(status()).toBe("Moved B out. Now 2 of 2."));
    await waitFor(() => expect(focusLabel()).toBe("Move B in under A"));
  });
});

describe("two moves asked before the first has been written", () => {
  it("the second is planned from the orders the first stored, not from the tree that was painted", async () => {
    const { world, host } = makeWorld({ parts: [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 3, "A wheel.")] });
    // A query library tells its observers on a later tick; so does the fake here. No render falls between the two jobs.
    world.lazyNotify(true);
    render(<Frame host={host} world={world} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Feet up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Wheel up" }));
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    // After Feet up the level is Feet 1, Bones 2, Wheel 3; Wheel up then swaps with Bones, not with Feet.
    expect(world.callsOf("patchRecord").map((c) => [c.args[0], c.args[1]])).toEqual([
      ["feet", { elementOrder: 1 }],
      ["bones", { elementOrder: 2 }],
      ["wheel", { elementOrder: 2 }],
      ["bones", { elementOrder: 3 }],
    ]);
    expect(sequence(world, ["patchRecord", "invalidatePlanFind"]).map((l) => l.split(" ").slice(0, 2).join(" "))).toEqual([
      'patchRecord "feet"',
      'patchRecord "bones"',
      'invalidatePlanFind "PV"',
      'patchRecord "wheel"',
      'patchRecord "bones"',
      'invalidatePlanFind "PV"',
    ]);
  });
});

describe("in and out", () => {
  it("in: the part goes under the part above it as its last sub-part; one patch, then the two levels are moved in the find cache without re-reads, then re-read once each", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await click("Move Knee in under Hip");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    expect(sequence(world, WRITES).map((l) => l.replace(/ \{"at".*$/, ""))).toEqual([
      'patchRecord "knee" {"partOf":{"@id":"PV/e/hip"},"elementOrder":1} "PV/e/knee"',
      'dropPlanFind "PV" "a:partOf" "bones" "knee" {"refresh":false}',
      'prependPlanFind "PV" "a:partOf" "hip" "knee" {"refresh":false}',
      'invalidatePlanFind "PV" "a:partOf" "bones" {"members":["PV/e/knee"]}',
      'invalidatePlanFind "PV" "a:partOf" "hip" {"members":["PV/e/knee"]}',
    ]);
    // The drop and the prepend leave the re-read to the queue: only the two invalidations read.
    expect(world.counts.reRead).toBe(2);
    expect(world.counts.prepend).toBe(1);
    expect(world.counts.drop).toBe(1);
    await waitFor(() => expect(world.parentOf("knee")).toBe("https://pv.example.test/base/e/hip"));
  });

  it("in is moved after the last sub-part of the part above when that part has some", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await click("Move Feet in under Bones");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    expect(world.callsOf("patchRecord")[0]!.args[1]).toEqual({ partOf: { "@id": "https://pv.example.test/base/e/bones" }, elementOrder: 3 });
  });

  it("out: the part goes to just after its parent, the parts after it are shifted, and both levels are re-read", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await click("Move Hip out a level");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    expect(sequence(world, WRITES).map((l) => l.replace(/ \{"at".*$/, ""))).toEqual([
      'patchRecord "hip" {"partOf":{"@id":"PV/e/sol1"},"elementOrder":2} "PV/e/hip"',
      'dropPlanFind "PV" "a:partOf" "bones" "hip" {"refresh":false}',
      'prependPlanFind "PV" "a:partOf" "sol1" "hip" {"refresh":false}',
      'patchRecord "feet" {"elementOrder":3} "PV/e/feet"',
      // Knee was the second of two under Bones: with Hip gone it closes the gap and becomes the first.
      'patchRecord "knee" {"elementOrder":1} "PV/e/knee"',
      'invalidatePlanFind "PV" "a:partOf" "bones" {"members":["PV/e/hip","PV/e/feet","PV/e/knee"]}',
      'invalidatePlanFind "PV" "a:partOf" "sol1" {"members":["PV/e/hip","PV/e/feet","PV/e/knee"]}',
    ]);
    await waitFor(() => expect(order()).toEqual(["bones", "knee", "hip", "feet"]));
  });
});

describe("a move that does not go through", () => {
  it("a first write that fails says nothing was changed, and re-reads the levels at once without members", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.failNext("patchRecord", new Error("boom"));
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await click("Move Feet up");
    await waitFor(() => expect(notes).toEqual(["Could not move Feet; nothing was changed (boom)"]));
    expect(world.callsOf("patchRecord")).toHaveLength(1);
    expect(sequence(world, ["invalidatePlanFind"])).toEqual(['invalidatePlanFind "PV" "a:partOf" "sol1" {"members":[]}']);
  });

  it("a later write that fails says which part was not renumbered, and re-reads with the members already written", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.failNth("patchRecord", 2, new Error("boom"));
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await click("Move Feet up");
    await waitFor(() => expect(notes).toEqual(["Moved Feet, but Bones was not renumbered (boom)"]));
    expect(sequence(world, ["invalidatePlanFind"])).toEqual(['invalidatePlanFind "PV" "a:partOf" "sol1" {"members":["PV/e/feet"]}']);
  });

  it("a version conflict from the first write says the part changed elsewhere, then the move's own sentence replaces it, and the write is not tried again", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.serverPatch("feet", { body: "Elsewhere" }, { body: "Elsewhere" }, '"feet-9"');
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await click("Move Feet up");
    await waitFor(() => expect(notes).toHaveLength(2));
    expect(notes).toEqual([
      "Feet changed elsewhere. The card now shows the latest; your change was not saved.",
      "Could not move Feet; nothing was changed (version conflict)",
    ]);
    expect(world.callsOf("patchRecord")).toHaveLength(1);
    expect(world.callsOf("reconcileAfterConflict")).toHaveLength(1);
  });

  it("a part the app holds without a version that changed in the vault stops the move with the one 'changed elsewhere' notice, and writes nothing", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.setClientEtag("feet", null);
    world.serverPatch("feet", { elementOrder: "7" }, { elementOrder: 7 }, '"feet-9"');
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await click("Move Feet up");
    await waitFor(() => expect(notes).toEqual(["Feet changed elsewhere. The card now shows the latest; your change was not saved."]));
    expect(world.callsOf("patchRecord")).toHaveLength(0);
    expect(world.callsOf("invalidatePlanFind").length).toBeGreaterThan(0);
  });

  it("a part whose version cannot be read is not moved, and the notice says to reload", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.setClientEtag("feet", null);
    world.serverPatch("feet", {}, {}, null as unknown as string);
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await click("Move Feet up");
    await waitFor(() => expect(notes.length).toBeGreaterThan(0));
    expect(notes.every((n) => n === VERSION_UNREAD)).toBe(true);
    expect(world.callsOf("patchRecord")).toHaveLength(0);
  });
});

describe("a level the host read only in part", () => {
  const three = () => [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 3, "A wheel.")];

  it("reads the whole level fresh before it moves, and plans from what the vault holds, not from the cached rows", async () => {
    const { world, host } = makeWorld({ parts: three() });
    render(<Frame host={host} world={world} />);
    act(() => world.cutLevel(SOL_ID, 2));
    // Behind the app's back the vault has Feet at 5: Bones, Wheel(3), Feet(5).
    world.serverPatch("feet", { elementOrder: "5" }, { elementOrder: 5 }, '"feet-1"');
    await click("Move Bones down");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(world.callsOf("pageChildIds")[0]!.args).toEqual([PLAN_VAULT, "https://pv.example.test/base/e/sol1", { cap: 1000 }]);
    expect(world.callsOf("readMember").map((c) => c.args[1])).toEqual([true, true, true]);
    expect(world.callsOf("markStale").map((c) => c.args[0])).toEqual(["bones", "feet", "wheel"].map((id) => `https://pv.example.test/base/e/${id}`));
    // The vault holds Bones 1, Wheel 3, Feet 5. Bones steps below the next SHOWN part, Feet, and the level is numbered 1..3 from that
    // order: Wheel 1, Feet 2, Bones 3. Cached orders (Bones 1, Feet 2, Wheel 3) would have written something else.
    expect(world.callsOf("patchRecord").map((c) => [c.args[0], c.args[1]])).toEqual([
      ["bones", { elementOrder: 3 }],
      ["wheel", { elementOrder: 1 }],
      ["feet", { elementOrder: 2 }],
    ]);
  });

  it("a level that cannot be read refuses the move: the level's sentence, nothing written", async () => {
    const { world, host } = makeWorld({ parts: three() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    act(() => world.cutLevel(SOL_ID, 2));
    world.failNext("pageChildIds", new Error("down"));
    await click("Move Bones down");
    await waitFor(() => expect(notes).toEqual(["Some parts at this level could not be read, so their order cannot be changed now. Try again."]));
    expect(world.callsOf("patchRecord")).toHaveLength(0);
  });

  it("a full level is not read through the host's level members at all", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await click("Move Feet up");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(world.callsOf("pageChildIds")).toHaveLength(0);
    expect(world.callsOf("readMember")).toHaveLength(0);
  });
});

describe("one move at a time, in one queue", () => {
  it("while a move is being written every move and remove button is disabled", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    const hold = world.hold("patchRecord");
    await click("Move Feet up");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    for (const name of ["Move Bones down", "Move Knee in under Hip", "Remove Bones", "Move Hip out a level"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled, name).toBe(true);
    }
    world.holds.delete("patchRecord");
    act(() => hold.release());
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    await waitFor(() => expect((screen.getByRole("button", { name: "Remove Bones" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("a text saved while a move is open starts after the move's writes and its re-read", async () => {
    const user = userEvent.setup();
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    const hold = world.hold("patchRecord");
    await click("Move Feet up");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "The hip carries the weight." }));
    const box = screen.getByLabelText("Edit Hip");
    await user.clear(box);
    await user.type(box, "New hip text");
    fireEvent.blur(box);
    await settle(60);
    expect(world.callsOf("patchRecord")).toHaveLength(1);
    world.holds.delete("patchRecord");
    act(() => hold.release());
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(3));
    expect(sequence(world, ["patchRecord", "invalidatePlanFind"]).map((l) => l.split(" ").slice(0, 3).join(" "))).toEqual([
      'patchRecord "feet" {"elementOrder":1}',
      'patchRecord "bones" {"elementOrder":2}',
      'invalidatePlanFind "PV" "a:partOf"',
      'patchRecord "hip" {"body":"New',
    ]);
  });
});

describe("in and out on a level the host read only in part", () => {
  const three = () => [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 3, "A wheel.")];
  const WR = ["pageChildIds", "patchRecord", "invalidatePlanFind"];
  const short = (world: ReturnType<typeof makeWorld>["world"]) => sequence(world, WR).map((l) => l.replace(/ \{"at".*$/, ""));

  it("in, from a level that is cut: that level is read fresh, and the parts after the moved one close the gap from what the vault holds", async () => {
    const { world, host } = makeWorld({ parts: three() });
    render(<Frame host={host} world={world} />);
    act(() => world.cutLevel(SOL_ID, 2));
    await click("Move Feet in under Bones");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    expect(short(world)).toEqual([
      'pageChildIds "PV" "PV/e/sol1" {"cap":1000}',
      'patchRecord "feet" {"partOf":{"@id":"PV/e/bones"},"elementOrder":3} "PV/e/feet"',
      'patchRecord "wheel" {"elementOrder":2} "PV/e/wheel"',
      'invalidatePlanFind "PV" "a:partOf" "sol1" {"members":["PV/e/feet","PV/e/wheel"]}',
      'invalidatePlanFind "PV" "a:partOf" "bones" {"members":["PV/e/feet","PV/e/wheel"]}',
    ]);
  });

  it("out, to a level that is cut: the place after the parent is found among every stored part of that level", async () => {
    const { world, host } = makeWorld({ parts: three() });
    render(<Frame host={host} world={world} />);
    act(() => world.cutLevel(SOL_ID, 2));
    await click("Move Hip out a level");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    expect(short(world)).toEqual([
      'pageChildIds "PV" "PV/e/sol1" {"cap":1000}',
      'patchRecord "hip" {"partOf":{"@id":"PV/e/sol1"},"elementOrder":2} "PV/e/hip"',
      'patchRecord "feet" {"elementOrder":3} "PV/e/feet"',
      'patchRecord "wheel" {"elementOrder":4} "PV/e/wheel"',
      'patchRecord "knee" {"elementOrder":1} "PV/e/knee"',
      'invalidatePlanFind "PV" "a:partOf" "bones" {"members":["PV/e/hip","PV/e/feet","PV/e/wheel","PV/e/knee"]}',
      'invalidatePlanFind "PV" "a:partOf" "sol1" {"members":["PV/e/hip","PV/e/feet","PV/e/wheel","PV/e/knee"]}',
    ]);
  });

  it("out, from a level that is cut: that level is read fresh to close the gap", async () => {
    const { world, host } = makeWorld({ parts: three() });
    render(<Frame host={host} world={world} />);
    act(() => world.cutLevel("bones", 1));
    await click("Move Hip out a level");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    expect(short(world).slice(0, 2)).toEqual([
      'pageChildIds "PV" "PV/e/bones" {"cap":1000}',
      'patchRecord "hip" {"partOf":{"@id":"PV/e/sol1"},"elementOrder":2} "PV/e/hip"',
    ]);
    expect(world.callsOf("patchRecord").map((c) => [c.args[0], c.args[1]]).slice(1)).toEqual([
      ["feet", { elementOrder: 3 }],
      ["wheel", { elementOrder: 4 }],
      ["knee", { elementOrder: 1 }],
    ]);
  });
});

describe("drag, by the keys of the tree", () => {
  const live = () => (document.querySelector("[aria-live='assertive']") as HTMLElement).textContent;
  async function pickUp(id: string) {
    const grip = document.querySelector(`[data-tree-handle='${id}']`) as HTMLButtonElement;
    grip.focus();
    fireEvent.keyDown(grip, { code: "Space", key: " " });
    await settle(10);
  }
  const press = async (code: string) => {
    fireEvent.keyDown(document, { code, key: code });
    await settle(10);
  };
  const ASSUMPTION = { type: "https://pv.example.test/base/t/Assumption" };
  const withAssumption = () => [...bonesFixture(), part("assume", "Sol.Assumption", SOL_ID, 3, "", ASSUMPTION), part("floor", "Sol.Assumption.Floor", "assume", 1, "Flat.", ASSUMPTION)];

  it("one place up in the same level is the same plan as the up arrow", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await pickUp("feet");
    await press("ArrowUp");
    await press("ArrowUp");
    await press("ArrowUp");
    expect(live()).toBe("Feet moved to the top level, first");
    await press("Space");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(live()).toBe("Dropped. Feet moved to the top level, first.");
    expect(world.callsOf("patchRecord").map((c) => [c.args[0], c.args[1]])).toEqual([
      ["feet", { elementOrder: 1 }],
      ["bones", { elementOrder: 2 }],
    ]);
  });

  it("a drop into another part moves the part, then renumbers what follows it there, then re-reads both levels", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await pickUp("feet");
    await press("ArrowUp");
    await press("ArrowUp");
    expect(live()).toBe("Feet moved under Bones, first");
    await press("Space");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(2));
    expect(sequence(world, WRITES).map((l) => l.replace(/ \{"at".*$/, ""))).toEqual([
      'patchRecord "feet" {"partOf":{"@id":"PV/e/bones"},"elementOrder":1} "PV/e/feet"',
      'dropPlanFind "PV" "a:partOf" "sol1" "feet" {"refresh":false}',
      'prependPlanFind "PV" "a:partOf" "bones" "feet" {"refresh":false}',
      'patchRecord "hip" {"elementOrder":2} "PV/e/hip"',
      'patchRecord "knee" {"elementOrder":3} "PV/e/knee"',
      'invalidatePlanFind "PV" "a:partOf" "sol1" {"members":["PV/e/feet","PV/e/hip","PV/e/knee"]}',
      'invalidatePlanFind "PV" "a:partOf" "bones" {"members":["PV/e/feet","PV/e/hip","PV/e/knee"]}',
    ]);
  });

  it("on a level read only in part, a one-place drop reads the level fresh first", async () => {
    const { world, host } = makeWorld({ parts: [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 3, "A wheel.")] });
    render(<Frame host={host} world={world} />);
    act(() => world.cutLevel(SOL_ID, 2));
    await pickUp("feet");
    await press("ArrowUp");
    await press("ArrowUp");
    await press("ArrowUp");
    await press("Space");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(sequence(world, ["pageChildIds"])).toEqual(['pageChildIds "PV" "PV/e/sol1" {"cap":1000}']);
    expect(world.callsOf("patchRecord").map((c) => [c.args[0], c.args[1]])).toEqual([
      ["feet", { elementOrder: 1 }],
      ["bones", { elementOrder: 2 }],
    ]);
  });

  it("an assumption is refused a place outside the Assumption part, with the sentence, and nothing is written", async () => {
    const { world, host } = makeWorld({ parts: withAssumption() });
    render(<Frame host={host} world={world} />);
    await pickUp("floor");
    await press("ArrowLeft");
    expect(live()).toBe("Floor is an assumption: it stays under the Assumption part.");
    await press("Space");
    expect(live()).toBe("Floor was not moved. Floor is an assumption: it stays under the Assumption part.");
    await settle(40);
    expect(world.callsOf("patchRecord")).toHaveLength(0);
  });

  it("a part that is not an assumption is refused a place under the Assumption part", async () => {
    const { world, host } = makeWorld({ parts: withAssumption() });
    render(<Frame host={host} world={world} />);
    await pickUp("feet");
    await press("ArrowDown");
    expect(live()).toBe("Feet is not an assumption: it cannot go under the Assumption part.");
    await press("Space");
    await settle(40);
    expect(world.callsOf("patchRecord")).toHaveLength(0);
  });

  it("the grips are off while a move is being written", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    const hold = world.hold("patchRecord");
    await click("Move Feet up");
    await waitFor(() => expect(world.callsOf("patchRecord")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Drag Bones" }).getAttribute("aria-disabled")).toBe("true");
    world.holds.delete("patchRecord");
    act(() => hold.release());
    await waitFor(() => expect(screen.getByRole("button", { name: "Drag Bones" }).getAttribute("aria-disabled")).toBe("false"));
  });
});
