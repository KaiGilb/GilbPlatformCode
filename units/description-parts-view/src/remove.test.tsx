import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Frame, SOL_ID, bonesFixture, makeWorld, part, sequence, settle } from "../test/fakeHost";

afterEach(() => cleanup());

const WRITES = ["pageChildIds", "markStale", "readMember", "deleteRecord", "dropPlanFind", "setFind", "invalidatePlanFind"];
const order = () => [...document.querySelectorAll("[data-part]")].map((e) => e.getAttribute("data-part"));
const click = (name: string) => userEvent.setup().click(screen.getByRole("button", { name }));

async function remove(name: string) {
  await click(`Remove ${name}`);
  await click("Confirm delete");
}

describe("Remove", () => {
  it("stops asking for the finds of the parts that are gone", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await remove("Bones");
    await waitFor(() => expect(order()).toEqual(["feet"]));
    const last = world.callsOf("useSubFinds").at(-1)!;
    expect([...(last.args[2] as string[])]).toEqual(["feet"]);
  });

  it("asks first: × shows Keep and Confirm delete, and Keep writes nothing", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await click("Remove Bones");
    expect(screen.queryByRole("button", { name: "Remove Bones" })).toBeNull();
    await click("Keep");
    expect(screen.getByRole("button", { name: "Remove Bones" })).toBeTruthy();
    expect(world.callsOf("deleteRecord")).toHaveLength(0);
    expect(world.callsOf("pageChildIds")).toHaveLength(0);
  });

  it("removes a part with its sub-parts, the deepest first, and after each delete drops it from its level and empties its own level, then re-reads the parent level once", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await remove("Bones");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(sequence(world, WRITES)).toEqual([
      // The plan: the part's level, read fresh (the members are first marked stale), then each sub-part's own level.
      'pageChildIds "PV" "PV/e/bones" {"cap":301}',
      'markStale "PV/e/hip"',
      'markStale "PV/e/knee"',
      'readMember "PV/e/hip" true',
      'readMember "PV/e/knee" true',
      'pageChildIds "PV" "PV/e/hip" {"cap":301}',
      'pageChildIds "PV" "PV/e/knee" {"cap":301}',
      // The deletes, deepest first. The find is dropped with NO re-read; the part's own find is emptied.
      'deleteRecord {"id":"hip","entityUri":"PV/e/hip"}',
      'dropPlanFind "PV" "a:partOf" "bones" "hip" {"members":[],"refresh":false}',
      'setFind "PV" "a:partOf" "hip"',
      'deleteRecord {"id":"knee","entityUri":"PV/e/knee"}',
      'dropPlanFind "PV" "a:partOf" "bones" "knee" {"members":[],"refresh":false}',
      'setFind "PV" "a:partOf" "knee"',
      'deleteRecord {"id":"bones","entityUri":"PV/e/bones"}',
      'dropPlanFind "PV" "a:partOf" "sol1" "bones" {"members":[],"refresh":false}',
      'setFind "PV" "a:partOf" "bones"',
      'invalidatePlanFind "PV" "a:partOf" "sol1" {"members":[]}',
    ]);
    // Three drops that read nothing, one re-read.
    expect(world.counts.drop).toBe(3);
    expect(world.counts.reRead).toBe(1);
    expect(notes.at(-1)).toBeNull();
    await waitFor(() => expect(order()).toEqual(["feet"]));
    expect([...world.server.keys()].sort()).toEqual(["feet", "sol1"]);
  });

  it("removes a part with no sub-parts: one delete, and the parent level is re-read", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await remove("Knee");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(world.callsOf("deleteRecord")).toHaveLength(1);
    expect(world.callsOf("invalidatePlanFind")[0]!.args.slice(0, 3)).toEqual(["https://pv.example.test/base", "a:partOf", "bones"]);
    await waitFor(() => expect(order()).toEqual(["bones", "hip", "feet"]));
  });

  it("a record that is not a part but still names the part is left in place, and the notice names it", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.server.set("sys", { ...part("sys", "Sys", "bones", 1, ""), typeUri: "https://pv.example.test/base/t/System" });
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await remove("Bones");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(notes.at(-1)).toBe("Removed Bones. Sys still names Bones as its part-of and was not removed.");
    expect(world.server.has("sys")).toBe(true);
    expect(world.server.has("bones")).toBe(false);
  });

  it("a delete that fails stops there: it says how many went, which did not, and why; the finds of the removed are emptied; the level is re-read", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.failNth("deleteRecord", 2, new Error("boom"));
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await remove("Bones");
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(notes.at(-1)).toBe("Removed 1 of 3 (Hip). Bones and Knee were not removed: boom.");
    expect(world.callsOf("deleteRecord")).toHaveLength(2);
    expect(world.server.has("hip")).toBe(false);
    expect(world.server.has("knee")).toBe(true);
    expect(world.callsOf("invalidatePlanFind")[0]!.args.slice(0, 4)).toEqual(["https://pv.example.test/base", "a:partOf", "sol1", { members: [] }]);
    // The first delete emptied hip's own find, and the failure does it again for each part that did go.
    expect(sequence(world, ["setFind"])).toEqual(['setFind "PV" "a:partOf" "hip"', 'setFind "PV" "a:partOf" "hip"']);
  });

  it("when the first delete fails, nothing was removed", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.failNext("deleteRecord", new Error("no way"));
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await remove("Bones");
    await waitFor(() => expect(notes.length).toBe(1));
    expect(notes[0]).toBe("Could not remove Bones; nothing was removed: no way.");
  });

  it("a sub-part that cannot be read refuses the whole removal before any delete", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const notes: (string | null)[] = [];
    world.failNext("pageChildIds", new Error("down"));
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await remove("Bones");
    await waitFor(() => expect(notes).toEqual(["Could not read the sub-parts of Bones; nothing was removed."]));
    expect(world.callsOf("deleteRecord")).toHaveLength(0);
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    expect(world.callsOf("invalidatePlanFind")[0]!.args.slice(0, 4)).toEqual(["https://pv.example.test/base", "a:partOf", "sol1", { members: [] }]);
  });

  it("more than 300 parts under it refuses the removal with the limit's own sentence", async () => {
    const many = Array.from({ length: 301 }, (_, i) => part(`m${i}`, `Sol.Bones.Hip.M${i}`, "hip", i + 1, ""));
    const { world, host } = makeWorld({ parts: [...bonesFixture(), ...many] });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    // Only the first of Hip's 301 sub-parts is drawn; the removal reads them all.
    act(() => world.cutLevel("hip", 1));
    await remove("Bones");
    await waitFor(() => expect(notes).toEqual(["more than 300 parts would be removed. Nothing was removed."]));
    expect(world.callsOf("deleteRecord")).toHaveLength(0);
  });

  it("more than 12 levels refuses the removal with the limit's own sentence", async () => {
    const chain = Array.from({ length: 13 }, (_, i) => part(`d${i}`, `Sol.D${i}`, i === 0 ? SOL_ID : `d${i - 1}`, 1, ""));
    const { world, host } = makeWorld({ parts: chain });
    const notes: (string | null)[] = [];
    render(<Frame host={host} world={world} onNotice={(n) => notes.push(n)} />);
    await remove("D0");
    await waitFor(() => expect(notes).toEqual(["too many levels to remove at once. Nothing was removed."]));
    expect(world.callsOf("deleteRecord")).toHaveLength(0);
  });

  it("while the deletes run, the buttons are off and a second removal cannot start", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    const hold = world.hold("deleteRecord");
    await remove("Knee");
    await waitFor(() => expect(world.callsOf("deleteRecord")).toHaveLength(1));
    expect((screen.getByRole("button", { name: "Remove Feet" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Feet up" }) as HTMLButtonElement).disabled).toBe(true);
    world.holds.delete("deleteRecord");
    act(() => hold.release());
    await waitFor(() => expect(world.callsOf("invalidatePlanFind")).toHaveLength(1));
    await settle();
    expect(world.callsOf("deleteRecord")).toHaveLength(1);
  });
});
