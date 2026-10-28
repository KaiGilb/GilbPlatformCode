// wouldLoop: the four cases of the app's planSearch test, the Part of loop case of its planQaTester2 test, and more.
import { describe, expect, it, vi } from "vitest";
import { PlanChainError, wouldLoop, type PlanLinkFacts } from "./index";

const HOST = "https://vault.example.test";
const uri = (id: string) => `${HOST}/base/e/${id}`;

type Rec = PlanLinkFacts & { entityUri?: string };

function parentOf(id: string, parent: string | null): Rec {
  const facts: Record<string, string> = { unitTag: id };
  const served: Record<string, unknown> = { unitTag: id };
  if (parent) {
    facts.fvParent = parent;
    served.fvParent = { "@id": parent };
  }
  return { entityUri: uri(id), facts, served: { facts: served } };
}

describe("wouldLoop (ported from planSearch)", () => {
  const self = { id: "a", entityUri: uri("a") };

  it("is true when the chosen parent is already under this record, without reading self", async () => {
    const read = vi.fn(async (id: string) => {
      if (id === "c") return parentOf("c", uri("b"));
      if (id === "b") return parentOf("b", uri("a"));
      throw new Error(`unexpected ${id}`);
    });
    expect(await wouldLoop(self, uri("c"), read)).toBe(true);
    expect(read.mock.calls.map((call) => call[0])).toEqual(["c", "b"]);
  });

  it("is true immediately when the record is chosen as its own parent", async () => {
    const read = vi.fn();
    expect(await wouldLoop(self, uri("a"), read)).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it("is false when the chain ends without reaching self, including a chain of 50", async () => {
    const read = vi.fn(async (id: string) => parentOf(id, null));
    expect(await wouldLoop(self, uri("z"), read)).toBe(false);
    const chain = vi.fn(async (id: string) => {
      const n = Number(id.slice(1));
      return parentOf(id, n === 1 ? null : uri(`n${n - 1}`));
    });
    expect(await wouldLoop(self, uri("n50"), chain)).toBe(false);
    expect(chain).toHaveBeenCalledTimes(50);
  });

  it("refuses a chain that still has a parent after 50 reads, and a read that fails", async () => {
    const deep = vi.fn(async (id: string) => parentOf(id, uri(`next-${id}`)));
    await expect(wouldLoop(self, uri("start"), deep)).rejects.toEqual(expect.objectContaining({
      message: "This chain is too deep to check.",
    }));
    expect(deep).toHaveBeenCalledTimes(50);
    await expect(wouldLoop(self, uri("start"), deep)).rejects.toBeInstanceOf(PlanChainError);

    const broken = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(wouldLoop(self, uri("c"), broken)).rejects.toThrow("Could not check the chain — try again.");
    const missing = vi.fn(async () => null);
    await expect(wouldLoop(self, uri("c"), missing)).rejects.toThrow("Could not check the chain — try again.");
  });
});

describe("wouldLoop (ported from planQaTester2)", () => {
  it("a parent link served as a one-member list is followed", async () => {
    const self = { id: "a", entityUri: uri("a") };
    const read = async (id: string): Promise<Rec | null> => {
      if (id === "c") return { entityUri: uri("c"), facts: { unitTag: "A.B.C" }, served: { facts: { unitTag: "A.B.C", fvParent: [{ "@id": uri("b") }] } } };
      if (id === "b") return { entityUri: uri("b"), facts: { unitTag: "A.B" }, served: { facts: { unitTag: "A.B", fvParent: [{ "@id": uri("a") }] } } };
      return null;
    };
    await expect(wouldLoop(self, uri("c"), read)).resolves.toBe(true);
  });
});

describe("wouldLoop (pinned)", () => {
  const self = { id: "a", entityUri: uri("a") };

  it("passes the id (the tail of the address) and the address itself to read", async () => {
    const read = vi.fn(async (id: string) => parentOf(id, null));
    await wouldLoop(self, uri("z"), read);
    expect(read.mock.calls).toEqual([["z", uri("z")]]);
  });

  it("walks up by the address each record names, not by its own entityUri", async () => {
    const read = vi.fn(async (id: string): Promise<Rec | null> => {
      if (id === "c") return { facts: { fvParent: `${HOST}/base/e/b` } };
      if (id === "b") return { facts: { fvParent: `${HOST}/base/e/a` } };
      return null;
    });
    await expect(wouldLoop(self, uri("c"), read)).resolves.toBe(true);
    expect(read.mock.calls).toEqual([["c", uri("c")], ["b", uri("b")]]);
  });

  it("finds self at the 50th read; the 51st would be needed to rule it out", async () => {
    // n50 -> n49 -> ... -> n1 -> a. The record read at step 50 (n1) names self.
    const chain = vi.fn(async (id: string) => parentOf(id, id === "n1" ? uri("a") : uri(`n${Number(id.slice(1)) - 1}`)));
    await expect(wouldLoop(self, uri("n50"), chain)).resolves.toBe(true);
    expect(chain).toHaveBeenCalledTimes(50);
  });

  it("throws too deep when the 50th record names a parent that is not self, after exactly 50 reads", async () => {
    const chain = vi.fn(async (id: string) => parentOf(id, uri(`n${Number(id.slice(1)) - 1}`)));
    const err = await wouldLoop(self, uri("n80"), chain).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanChainError);
    expect((err as Error).message).toBe("This chain is too deep to check.");
    expect(chain).toHaveBeenCalledTimes(50);
  });

  it("PlanChainError is an Error named PlanChainError, and a failed read is the unread notice", async () => {
    const err = await wouldLoop(self, uri("c"), async () => null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PlanChainError);
    expect((err as Error).name).toBe("PlanChainError");
    expect((err as Error).message).toBe("Could not check the chain — try again.");
  });

  it("a read that fails part-way down the chain throws the unread notice (nothing is guessed)", async () => {
    const read = async (id: string) => {
      if (id === "c") return parentOf("c", uri("b"));
      throw new Error("down");
    };
    await expect(wouldLoop(self, uri("c"), read)).rejects.toThrow("Could not check the chain — try again.");
  });

  it("names self by id, by address, or by the other spelling of the address", async () => {
    const read = vi.fn();
    expect(await wouldLoop(self, "a", read)).toBe(true);
    expect(await wouldLoop(self, `${HOST}/vault/e/a`, read)).toBe(true);
    expect(await wouldLoop({ id: "a" }, uri("a"), read)).toBe(true);
    expect(await wouldLoop({ id: "a" }, `${HOST}/vault/e/a`, read)).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it("a parent chain with no parent at the first record is not a loop", async () => {
    const read = vi.fn(async () => ({ facts: {} }) as Rec);
    expect(await wouldLoop(self, uri("c"), read)).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a chain that loops among other records, never reaching self, runs to the limit and then throws too deep", async () => {
    const read = vi.fn(async (id: string) => parentOf(id, id === "x" ? uri("y") : uri("x")));
    await expect(wouldLoop(self, uri("x"), read)).rejects.toThrow("This chain is too deep to check.");
    expect(read).toHaveBeenCalledTimes(50);
  });
});
