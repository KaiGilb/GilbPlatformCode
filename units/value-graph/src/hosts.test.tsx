// What the graph does without what the app must provide.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createTypePictureSource, TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { EndpointPart, ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValueGraph } from "./index";

afterEach(() => {
  cleanup();
  resetTermOrigin();
});

const part = (name: string): EndpointPart => ({ typeIri: `https://ontology.example.test/base/t/${name}`, typeLabel: name, words: "" });
const none: EndpointPart = { typeIri: "", typeLabel: "", words: "" };
const card = (subject: EndpointPart): ValueCardData => ({
  scale: { text: "minutes", unit: "min", rate: "", context: "", direction: "lower", source: {} },
  variables: [],
  endpoint: { subject, reference: none, text: "", source: {} },
  meters: [],
  levels: [{ kind: "Goal", value: 5, qualifier: { when: "", variables: {}, conditions: [], side: "" }, source: {}, note: "" }],
});

describe("without the providers", () => {
  it("a card whose endpoints name no type needs neither: nothing in the graph reads them", () => {
    const { container } = render(<PlanValueGraph data={card(none)} editing={false} onChangeLevels={() => {}} />);
    expect(container.querySelector("[role=slider]")).not.toBeNull();
    expect(container.querySelector("[data-endpoint-end]")).toBeNull();
  });

  it("a type at an endpoint with no TermDefinitionContext throws the error that names it, as soon as the graph draws", () => {
    setTermOrigin("https://ontology.example.test");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PlanValueGraph data={card(part("MobileApp"))} editing={false} onChangeLevels={() => {}} />)).toThrow(/TermDefinitionContext/);
    quiet.mockRestore();
  });

  it("with no picture source the end draws its caption and no image", () => {
    setTermOrigin("https://ontology.example.test");
    const { container } = render(
      <TermDefinitionContext.Provider value={async () => ({ state: "none" })}>
        <PlanValueGraph data={card(part("MobileApp"))} editing={false} onChangeLevels={() => {}} />
      </TermDefinitionContext.Provider>,
    );
    expect(container.querySelector('[data-endpoint-end="subject"]')).not.toBeNull();
    expect(container.querySelector("[data-endpoint-end] img")).toBeNull();
    expect(container.textContent).toContain("MobileApp");
  });

  it("with a picture source the picture of the type is drawn, and a click on the caption opens its definition", async () => {
    setTermOrigin("https://ontology.example.test");
    const source = { ...createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: () => "https://files.example.test" }), fetchTypePictureSrc: async () => "https://files.example.test/files/phone.png" };
    const read = vi.fn(async () => ({ state: "defined" as const, does: "A program for a phone." }));
    const { container } = render(
      <TypePictureSourceContext.Provider value={source}>
        <TermDefinitionContext.Provider value={read}>
          <PlanValueGraph data={card(part("MobileApp"))} editing={false} onChangeLevels={() => {}} />
        </TermDefinitionContext.Provider>
      </TypePictureSourceContext.Provider>,
    );
    await waitFor(() => expect(container.querySelector('[data-endpoint-end="subject"] img')!.getAttribute("src")).toBe("https://files.example.test/files/phone.png"));
    fireEvent.click(screen.getByTestId("endpoint-subject"));
    await screen.findByText("A program for a phone.");
    expect(read).toHaveBeenCalledWith("MobileApp");
  });
});
