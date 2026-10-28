import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import type { TypePictureSource } from "@kaigilb/gilbplatformcode-type-picture";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { TermDefinitionContext, TypePictureButton } from "./index";
import type { ReadTermDefinition } from "./index";

beforeEach(() => setTermOrigin("https://ontology.example.test"));
afterEach(() => {
  cleanup();
  resetTermOrigin();
});

const source = (map: Record<string, string | null>) =>
  ({ fetchTypePictureSrc: vi.fn(async (name: string) => map[name] ?? null) }) as unknown as TypePictureSource;
const read = vi.fn<ReadTermDefinition>(async () => ({ state: "defined", does: "A seat." }));
const draw = (map: Record<string, string | null>, ui: ReactNode) =>
  render(
    <TypePictureSourceContext.Provider value={source(map)}>
      <TermDefinitionContext.Provider value={read}>{ui}</TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>,
  );

const CHAIR = { Chair: "https://files.example.test/files/chair" };

describe("TypePictureButton", () => {
  it("renders nothing without a picture (no source, an unknown type, while loading)", async () => {
    const none = render(<TypePictureButton typeName="Chair" label="Chair" ariaLabel="Type: chair" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(none.container.innerHTML).toBe("");
    none.unmount();
    const unknown = draw({}, <TypePictureButton typeName="Chair" label="Chair" ariaLabel="Type: chair" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(unknown.container.innerHTML).toBe("");
  });

  it("draws nothing without a picture even when no definition reader is provided: the popover is not made", async () => {
    const { container } = render(
      <TypePictureSourceContext.Provider value={source({})}>
        <TypePictureButton typeName="Chair" label="Chair" ariaLabel="Type: chair" />
      </TypePictureSourceContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("with a picture draws one button with a 44 px hit area (min-h-11, min-w-11) around a 20 px image", async () => {
    const { container } = draw(CHAIR, <TypePictureButton typeName="Chair" label="Chair" ariaLabel="Subject type: chair" triggerTestId="plan-type-picture" />);
    const button = await screen.findByTestId("plan-type-picture");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-label")).toBe("Subject type: chair");
    expect(button.getAttribute("class")).toBe("-my-3 inline-flex min-h-11 min-w-11 items-center justify-center align-middle");
    const img = button.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://files.example.test/files/chair");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("width")).toBe("20");
    expect(img.getAttribute("height")).toBe("20");
    expect(img.style.width).toBe("20px");
    expect(img.getAttribute("class")).toBe("shrink-0 object-contain");
    expect(container.childNodes).toHaveLength(1);
  });

  it("px sets the image size; data-type-picture is the name as the caller gave it, while the picture is looked up by the bare name", async () => {
    const s = source(CHAIR);
    render(
      <TypePictureSourceContext.Provider value={s}>
        <TermDefinitionContext.Provider value={read}>
          <TypePictureButton typeName="t:Chair" label="Chair" ariaLabel="x" px={32} triggerTestId="trig" />
        </TermDefinitionContext.Provider>
      </TypePictureSourceContext.Provider>,
    );
    const img = (await screen.findByTestId("trig")).querySelector("img")!;
    expect(img.getAttribute("width")).toBe("32");
    expect(img.getAttribute("height")).toBe("32");
    expect(img.getAttribute("data-type-picture")).toBe("t:Chair");
    expect(s.fetchTypePictureSrc).toHaveBeenCalledWith("Chair");
  });

  it("a click opens the definition popover, labelled with `label`, with the caller's testid", async () => {
    draw(CHAIR, <TypePictureButton typeName="Chair" label="Seat" ariaLabel="x" triggerTestId="plan-type-picture" popoverTestId="plan-type-picture-popover" />);
    fireEvent.click(await screen.findByTestId("plan-type-picture"));
    const pop = await screen.findByTestId("plan-type-picture-popover");
    expect(pop.getAttribute("aria-label")).toBe("Seat definition");
    await screen.findByText("A seat.");
    expect(read).toHaveBeenCalledWith("Chair");
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://ontology.example.test/base/t/Chair");
  });

  it("passes onOpenOntology to the popover", async () => {
    const open = vi.fn();
    draw(CHAIR, <TypePictureButton typeName="Chair" label="Chair" ariaLabel="x" triggerTestId="trig" onOpenOntology={open} />);
    fireEvent.click(await screen.findByTestId("trig"));
    fireEvent.click(await screen.findByRole("button", { name: "Open in Ontology" }));
    expect(open).toHaveBeenCalledWith("Chair");
  });

  it("an image that fails to load takes the whole button away", async () => {
    draw(CHAIR, <TypePictureButton typeName="Chair" label="Chair" ariaLabel="x" triggerTestId="trig" />);
    const button = await screen.findByTestId("trig");
    fireEvent.error(button.querySelector("img")!);
    await waitFor(() => expect(screen.queryByTestId("trig")).toBeNull());
  });

  it("a picture with no definition reader throws an error naming the provider (caught here by an error boundary)", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    class Catch extends Component<{ children: ReactNode }, { error: Error | null }> {
      override state: { error: Error | null } = { error: null };
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      override render() {
        return this.state.error ? <p data-testid="caught">{this.state.error.message}</p> : this.props.children;
      }
    }
    render(
      <TypePictureSourceContext.Provider value={{ fetchTypePictureSrc: () => Promise.resolve("https://files.example.test/files/chair") } as unknown as TypePictureSource}>
        <Catch>
          <TypePictureButton typeName="Chair" label="Chair" ariaLabel="x" />
        </Catch>
      </TypePictureSourceContext.Provider>,
    );
    expect((await screen.findByTestId("caught")).textContent).toBe(
      "type-term-popover: wrap the app in <TermDefinitionContext.Provider value={readTermDefinition}>",
    );
    quiet.mockRestore();
  });
});
