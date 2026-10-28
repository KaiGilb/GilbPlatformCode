import { describe, expect, it, vi } from "vitest";
import { typeDefinitionOnce } from "./index";
import type { ReadTermDefinition, TermDefinition } from "./index";

const defined: TermDefinition = { state: "defined", does: "A human being." };
const none: TermDefinition = { state: "none" };
const unreachable: TermDefinition = { state: "unreachable", reason: "offline" };

describe("typeDefinitionOnce", () => {
  it("calls the reader once per name and hands every caller the same promise", async () => {
    const read = vi.fn<ReadTermDefinition>(async () => defined);
    const a = typeDefinitionOnce(read, "Person");
    const b = typeDefinitionOnce(read, "Person");
    expect(b).toBe(a);
    expect(await a).toEqual(defined);
    expect(await typeDefinitionOnce(read, "Person")).toEqual(defined);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("Person");
  });

  it("asks again for another name", async () => {
    const read = vi.fn<ReadTermDefinition>(async (name) => ({ state: "defined", does: `about ${name}` }));
    expect(await typeDefinitionOnce(read, "Person")).toEqual({ state: "defined", does: "about Person" });
    expect(await typeDefinitionOnce(read, "Thing")).toEqual({ state: "defined", does: "about Thing" });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("holds the answer 'none' too: it is a fact about the term", async () => {
    const read = vi.fn<ReadTermDefinition>(async () => none);
    await typeDefinitionOnce(read, "Person");
    await typeDefinitionOnce(read, "Person");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not hold an unreachable answer: the next ask goes to the reader again", async () => {
    const read = vi.fn<ReadTermDefinition>().mockResolvedValueOnce(unreachable).mockResolvedValueOnce(defined);
    expect(await typeDefinitionOnce(read, "Person")).toEqual(unreachable);
    await Promise.resolve();
    expect(await typeDefinitionOnce(read, "Person")).toEqual(defined);
    expect(await typeDefinitionOnce(read, "Person")).toEqual(defined);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("while an unreachable read is still in flight, a second ask shares it", async () => {
    let answer: (d: TermDefinition) => void = () => {};
    const read = vi.fn<ReadTermDefinition>(() => new Promise<TermDefinition>((r) => (answer = r)));
    const a = typeDefinitionOnce(read, "Person");
    const b = typeDefinitionOnce(read, "Person");
    answer(unreachable);
    expect(await a).toEqual(unreachable);
    expect(await b).toEqual(unreachable);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("holds one cache per reader: another reader (another session) asks again", async () => {
    const one = vi.fn<ReadTermDefinition>(async () => defined);
    const two = vi.fn<ReadTermDefinition>(async () => defined);
    await typeDefinitionOnce(one, "Person");
    await typeDefinitionOnce(two, "Person");
    await typeDefinitionOnce(one, "Person");
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
  });

  it("keys the cache by the name exactly as given (t:Person and Person are two names)", async () => {
    const read = vi.fn<ReadTermDefinition>(async () => defined);
    await typeDefinitionOnce(read, "t:Person");
    await typeDefinitionOnce(read, "Person");
    expect(read.mock.calls).toEqual([["t:Person"], ["Person"]]);
  });
});
