// The writer and the reader agree on the depth cap. The reader shows at most ORG_DEPTH_CAP ancestors above an organization; the writer must not admit a parent that would put the child's chain past that.
import { describe, expect, it } from "vitest";
import { ORG_DEPTH_CAP, checkParentWrite, walkUp, type ParentReader } from "./orgHierarchy";

const e = (id: string) => `https://v.example.test/base/e/${id}`;
/** A straight chain o0 -> o1 -> ... -> o{n}; o{n} is the head office. */
function chain(n: number): ParentReader {
  return async (uri) => {
    const i = Number(uri.split("/").pop()!.slice(1));
    return Number.isNaN(i) ? { state: "unreadable" } : { state: "ok", parent: i >= n ? null : e(`o${i + 1}`), label: `O${i}` };
  };
}

describe("the depth cap is the same number for the writer and the reader", () => {
  it("a parent with CAP-1 ancestors is accepted: the child then has exactly CAP ancestors, which the reader can show whole", async () => {
    const read = chain(ORG_DEPTH_CAP - 1); // o0 has 19 ancestors
    expect((await checkParentWrite("x", e("o0"), read)).ok).toBe(true);
    const rowsAfter: ParentReader = async (u) => (u === "x" ? { state: "ok", parent: e("o0"), label: "X" } : read(u));
    const up = await walkUp("x", rowsAfter);
    expect(up.chain).toHaveLength(ORG_DEPTH_CAP);
    expect(up.end).toBe("head");
  });
  it("a parent with CAP ancestors is REFUSED (the child's chain would be CAP+1, which the reader cuts off)", async () => {
    const read = chain(ORG_DEPTH_CAP); // o0 has 20 ancestors
    const r = await checkParentWrite("x", e("o0"), read);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too-deep");
  });
  it("everything the writer accepts, the reader shows to the head office (no 'Stopped' after an accepted write)", async () => {
    for (const n of [0, 1, ORG_DEPTH_CAP - 2, ORG_DEPTH_CAP - 1, ORG_DEPTH_CAP, ORG_DEPTH_CAP + 1]) {
      const read = chain(n);
      const ok = (await checkParentWrite("x", e("o0"), read)).ok;
      const after: ParentReader = async (u) => (u === "x" ? { state: "ok", parent: e("o0"), label: "X" } : read(u));
      const up = await walkUp("x", after);
      if (ok) expect(up.end).toBe("head");
      else expect(up.end).toBe("too-deep");
    }
  });
});
