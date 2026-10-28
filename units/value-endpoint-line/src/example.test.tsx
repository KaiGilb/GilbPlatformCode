// The README example, run: the Endpoint line in a card, with the host of the lines and the contexts of the type pieces above it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createTypePictureSource, TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { ValueLinesHostContext, type ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { emptyValueCard, type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanEndpointBody } from "./index";
import { record, VAULT, render } from "../test/mount";

// Once, at the start of the app: where the types' documents are, and where their picture files are served from.
setTermOrigin("https://ontology.example.test");
const pictures = createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: () => "https://files.example.test" });
const readTermDefinition: ReadTermDefinition = async () => ({ state: "none" });

// The host of the lines: the type search (one function, for the chooser and for "Find types"), its reach, and the opener of the ontology page.
const host: ValueLinesHost = {
  useLinkLabel: () => null,
  searchTypes: async () => ({
    options: [{ id: "veda:Person", label: "Person", typeName: "Person", spec: null, kind: "type" }],
    reach: "Searched the example ontology.",
    degraded: false,
  }),
  blankReach: "Type to search the example ontology.",
  openOntologyConcept: (typeName) => console.log("open", typeName),
};

function EndpointCard({ start, save }: { start: ValueCardData; save: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <TypePictureSourceContext.Provider value={pictures}>
      <TermDefinitionContext.Provider value={readTermDefinition}>
        <ValueLinesHostContext.Provider value={host}>
          <PlanEndpointBody
            data={data}
            editing={false}
            canEdit
            vaultId={VAULT}
            record={record}
            onOpen={() => {}}
            selfId={null}
            onChange={(next) => {
              save(next);
              setData(next);
            }}
          />
        </ValueLinesHostContext.Provider>
      </TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  setTermOrigin("https://ontology.example.test");
});

describe("the README example", () => {
  it("a click on the Subject opens the type chooser; a pick hands up the whole card once, with the type's address", async () => {
    const saved = vi.fn();
    const start = emptyValueCard();
    render(<EndpointCard start={start} save={saved} />, null);
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    await userEvent.click(await screen.findByTestId("type-chooser-option-veda:Person"));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]![0].endpoint.subject).toEqual({ typeIri: "https://ontology.example.test/base/t/Person", typeLabel: "Person", words: "" });
    expect(saved.mock.calls[0]![0].levels).toBe(start.levels);
  });
});
