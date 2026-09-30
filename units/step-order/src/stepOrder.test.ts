import { describe, expect, it } from "vitest";
import { buildStepCreateFacts, computeStepReorder, nextStepOrder, type StepOrderRecord } from "./stepOrder";

function step(id: string, order: number, spelling: "camel" | "kebab" = "camel"): StepOrderRecord {
  const doc: StepOrderRecord = { "@id": `https://example.test/base/e/${id}` };
  if (spelling === "camel") doc.stepOrder = order;
  else doc["step-order"] = order;
  return doc;
}

describe("nextStepOrder", () => {
  it("is one more than the highest finite number, and at least 1", () => {
    expect(nextStepOrder([])).toBe(1);
    expect(nextStepOrder([{ stepOrder: 1 }, { stepOrder: 4 }])).toBe(5);
    expect(nextStepOrder([{ stepOrder: 0, "step-order": 9 }])).toBe(1);
    expect(nextStepOrder([{ stepOrder: "2" }])).toBe(1);
  });
});

describe("computeStepReorder", () => {
  it("moves index 1 to 3 and writes only the steps whose number changed", () => {
    const steps = [step("a", 1), step("b", 2), step("c", 3), step("d", 4), step("e", 5)];
    const plan = computeStepReorder(steps, 1, 3);
    expect(plan.newOrder.map((s) => s["@id"])).toEqual([
      steps[0]!["@id"],
      steps[2]!["@id"],
      steps[3]!["@id"],
      steps[1]!["@id"],
      steps[4]!["@id"],
    ]);
    expect(plan.writes.map((w) => w.stepIdTail)).toEqual(["c", "d", "b"]);
    expect(plan.writes.map((w) => w.targetOrdinal)).toEqual([2, 3, 4]);
    expect(plan.writes.every((w) => w.retireKebab === false)).toBe(true);
    expect(plan.newOrder[1]).toBe(steps[2]);
  });

  it("does not heal when the indexes are the same", () => {
    const steps = [step("a", 7), step("b", 7)];
    const plan = computeStepReorder(steps, 0, 0);
    expect(plan.writes).toEqual([]);
    expect(plan.newOrder).not.toBe(steps);
  });

  it("flags a kebab key for retirement", () => {
    const steps = [step("a", 1, "kebab"), step("b", 2, "kebab")];
    const plan = computeStepReorder(steps, 0, 1);
    expect(plan.writes.every((w) => w.retireKebab)).toBe(true);
  });
});

describe("buildStepCreateFacts", () => {
  it("writes the process as an id object and the order as a number", () => {
    expect(buildStepCreateFacts("https://example.test/base/e/proc", 2, "  hello  ")).toEqual({
      processOf: { "@id": "https://example.test/base/e/proc" },
      stepOrder: 2,
      instruction: "hello",
    });
  });

  it("omits a blank instruction", () => {
    const facts = buildStepCreateFacts("https://example.test/base/e/proc", 1, "  ");
    expect(facts).not.toHaveProperty("instruction");
    expect(facts.stepOrder).toBe(1);
  });
});
