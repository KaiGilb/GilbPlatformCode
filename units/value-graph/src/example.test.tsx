// The README example, run: the providers the graph needs, a card that keeps the data in state, and the host saving what
// onChangeLevels gives.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createTypePictureSource, TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValueGraph } from "./index";

// Once, at the start of the app: where the types' documents are, and where their picture files are served from.
setTermOrigin("https://ontology.example.test");
const pictures = createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: () => "https://files.example.test" });
const readTermDefinition: ReadTermDefinition = async () => ({ state: "none" });

const level = (kind: string, value: number, when = ""): ValueLevel => ({
  kind,
  value,
  qualifier: { when, variables: {}, conditions: [], side: "" },
  source: {},
  note: "",
});
const card: ValueCardData = {
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "", direction: "lower", source: {} },
  variables: [],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels: [level("Status", 9, "2026-10-27"), level("Goal", 5, "2027-06-30")],
};

// The graph never writes: the host saves what it gives, here into a list, and shows the saved levels again.
function Illustration({ start, save }: { start: ValueCardData; save: (levels: ValueLevel[]) => void }) {
  const [data, setData] = useState(start);
  return (
    <TypePictureSourceContext.Provider value={pictures}>
      <TermDefinitionContext.Provider value={readTermDefinition}>
        <PlanValueGraph
          data={data}
          editing
          onChangeLevels={(levels) => {
            save(levels);
            setData({ ...data, levels });
          }}
        />
      </TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  resetTermOrigin();
  setTermOrigin("https://ontology.example.test");
});

describe("the README example", () => {
  it("steps a Goal one step with the arrow key and hands the whole new list to the host, once", () => {
    const saved = vi.fn();
    render(<Illustration start={card} save={saved} />);
    const goal = screen.getByRole("slider", { name: /^Goal/ });
    fireEvent.keyDown(goal, { key: "ArrowRight" });
    expect(saved).toHaveBeenCalledTimes(1);
    const next = saved.mock.calls[0]![0] as ValueLevel[];
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(card.levels[0]);
    expect(next[1]!.kind).toBe("Goal");
    expect(next[1]!.value).not.toBe(5);
  });

  it("adds a Past from the + New menu: the host receives the old levels and the new one at the end, and the graph draws it", () => {
    const saved = vi.fn();
    render(<Illustration start={card} save={saved} />);
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    fireEvent.click(document.querySelector('[data-newmenu-set="0"] [data-kind-btn="Past"]')!);
    const next = saved.mock.calls[0]![0] as ValueLevel[];
    expect(next.map((l) => l.kind)).toEqual(["Status", "Goal", "Past"]);
    expect(screen.getAllByRole("slider")).toHaveLength(3);
  });
});
