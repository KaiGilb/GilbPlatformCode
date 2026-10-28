import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, type ReactNode } from "react";
import { ModalPortalContext, MODAL_LAYER_Z, topOpen } from "@kaigilb/gilbplatformcode-open-popups";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { TYPE_POPOVER_ATTR, TermDefinitionContext, TypeTermPopover } from "./index";
import type { ReadTermDefinition, TermDefinition } from "./index";

beforeEach(() => setTermOrigin("https://ontology.example.test"));
afterEach(() => {
  cleanup();
  resetTermOrigin();
});

const withReader = (read: ReadTermDefinition) => ({ children }: { children: ReactNode }) => (
  <TermDefinitionContext.Provider value={read}>{children}</TermDefinitionContext.Provider>
);
const reader = (answer: TermDefinition) => vi.fn<ReadTermDefinition>(async () => answer);
const show = (read: ReadTermDefinition, ui: ReactNode) => render(ui, { wrapper: withReader(read) });

describe("TypeTermPopover (the source's cases)", () => {
  it("shows the definition and one new-tab link to <origin>/base/t/<Name>", async () => {
    show(reader({ state: "defined", does: "A human being." }), <TypeTermPopover typeName="t:Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("A human being.");
    const link = screen.getByRole("link", { name: /Open in GilbVeda/ });
    expect(link.getAttribute("href")).toBe("https://ontology.example.test/base/t/Person");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("an unreachable term gets no link", async () => {
    show(reader({ state: "unreachable", reason: "x" }), <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("The definition could not be reached.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("Escape closes the popover and returns focus to the trigger", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    const pop = await screen.findByTestId("type-term-popover");
    fireEvent.keyDown(pop, { key: "Escape" });
    expect(screen.queryByTestId("type-term-popover")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("trig"));
  });
});

describe("the provider", () => {
  it("a missing provider throws an error naming it", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TypeTermPopover typeName="Person">Person</TypeTermPopover>)).toThrow(
      "type-term-popover: wrap the app in <TermDefinitionContext.Provider value={readTermDefinition}>",
    );
    quiet.mockRestore();
  });

  it("the reader is not called until the popover opens", () => {
    const read = reader({ state: "none" });
    show(read, <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("the trigger", () => {
  it("is a button of type=button with aria-haspopup=dialog, aria-expanded following the state, and the caller's testid, class and label", () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig" className="c1" ariaLabel="About Person">Person</TypeTermPopover>);
    const trig = screen.getByTestId("trig");
    expect(trig.tagName).toBe("BUTTON");
    expect(trig.getAttribute("type")).toBe("button");
    expect(trig.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trig.getAttribute("aria-expanded")).toBe("false");
    expect(trig.getAttribute("aria-label")).toBe("About Person");
    expect(trig.getAttribute("class")).toBe("c1");
    expect(trig.textContent).toBe("Person");
    fireEvent.click(trig);
    expect(trig.getAttribute("aria-expanded")).toBe("true");
  });

  it("a second click closes it, and the focus stays where it was", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    const trig = screen.getByTestId("trig");
    fireEvent.click(trig);
    await screen.findByTestId("type-term-popover");
    fireEvent.click(trig);
    expect(screen.queryByTestId("type-term-popover")).toBeNull();
    expect(trig.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on Enter and on Space, as a native button does", async () => {
    const user = userEvent.setup();
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    const trig = screen.getByTestId("trig");
    trig.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("type-term-popover")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("type-term-popover")).toBeNull();
    trig.focus();
    await user.keyboard(" ");
    expect(await screen.findByTestId("type-term-popover")).toBeTruthy();
  });

  it("a click on the trigger does not reach a parent's click handler", () => {
    const parent = vi.fn();
    show(reader({ state: "none" }), (
      <div onClick={parent}>
        <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>
      </div>
    ));
    fireEvent.click(screen.getByTestId("trig"));
    expect(parent).not.toHaveBeenCalled();
  });
});

describe("the popover", () => {
  it("is a focusable dialog, labelled '<label or name> definition', with the marker attribute and the default testid, and takes the focus on open", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="t:Person" label="Human" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    const pop = await screen.findByTestId("type-term-popover");
    expect(pop.getAttribute("role")).toBe("dialog");
    expect(pop.getAttribute("aria-label")).toBe("Human definition");
    expect(pop.getAttribute("tabindex")).toBe("-1");
    expect(pop.hasAttribute(TYPE_POPOVER_ATTR)).toBe(true);
    expect(TYPE_POPOVER_ATTR).toBe("data-type-term-popover");
    expect(document.activeElement).toBe(pop);
  });

  it("without a label the aria-label uses the bare name (the t: prefix removed)", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="t:Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    expect((await screen.findByTestId("type-term-popover")).getAttribute("aria-label")).toBe("Person definition");
  });

  it("popoverTestId replaces the default testid", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig" popoverTestId="plan-type-popover">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    expect(await screen.findByTestId("plan-type-popover")).toBeTruthy();
    expect(screen.queryByTestId("type-term-popover")).toBeNull();
  });

  it("is fixed under the trigger (4 px below its bottom edge, at its left edge) on the modal layer, by inline style", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    const trig = screen.getByTestId("trig");
    trig.getBoundingClientRect = () => ({ left: 30, bottom: 50, top: 20, right: 90, width: 60, height: 30, x: 30, y: 20, toJSON() {} });
    fireEvent.click(trig);
    const pop = await screen.findByTestId("type-term-popover");
    expect(pop.style.position).toBe("fixed");
    expect(pop.style.left).toBe("30px");
    expect(pop.style.top).toBe("54px");
    expect(pop.style.zIndex).toBe(String(MODAL_LAYER_Z));
    expect(MODAL_LAYER_Z).toBe(100);
    expect(pop.className).toContain("w-64");
    expect(pop.className).not.toMatch(/\bz-\[/);
  });

  it("is portalled to the body", async () => {
    const { container } = show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    const pop = await screen.findByTestId("type-term-popover");
    expect(pop.parentElement).toBe(document.body);
    expect(container.contains(pop)).toBe(false);
  });

  it("is portalled to the open dialog's root when it is rendered inside one", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    show(reader({ state: "none" }), (
      <ModalPortalContext.Provider value={root}>
        <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>
      </ModalPortalContext.Provider>
    ));
    fireEvent.click(screen.getByTestId("trig"));
    const pop = await screen.findByTestId("type-term-popover");
    expect(pop.parentElement).toBe(root);
    root.remove();
  });

  it("a click inside it does not reach a parent's click handler", async () => {
    const parent = vi.fn();
    show(reader({ state: "none" }), (
      <div onClick={parent}>
        <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>
      </div>
    ));
    fireEvent.click(screen.getByTestId("trig"));
    fireEvent.click(await screen.findByTestId("type-term-popover"));
    expect(parent).not.toHaveBeenCalled();
  });

  it("Escape in it does not reach a parent's key handler; another key does", async () => {
    const parentKey = vi.fn();
    show(reader({ state: "none" }), (
      <div onKeyDown={parentKey}>
        <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>
      </div>
    ));
    fireEvent.click(screen.getByTestId("trig"));
    const pop = await screen.findByTestId("type-term-popover");
    fireEvent.keyDown(pop, { key: "a" });
    expect(parentKey).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(pop, { key: "Escape" });
    expect(parentKey).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("type-term-popover")).toBeNull();
  });
});

describe("what it says", () => {
  it("says 'Reading the definition…' until the answer, and no link while reading", async () => {
    let answer: (d: TermDefinition) => void = () => {};
    const read = vi.fn<ReadTermDefinition>(() => new Promise<TermDefinition>((r) => (answer = r)));
    show(read, <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    expect(await screen.findByText("Reading the definition…")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    answer({ state: "defined", does: "A human being." });
    await screen.findByText("A human being.");
    expect(screen.queryByText("Reading the definition…")).toBeNull();
  });

  it("a type with no definition says so, and still has the link (the term was read)", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("This type has no definition.");
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://ontology.example.test/base/t/Person");
    expect(screen.getByRole("link").textContent).toBe("Open in GilbVeda ↗");
  });

  it("asks the reader for the bare name, once, and keeps the answer across a close and a reopen", async () => {
    const read = reader({ state: "defined", does: "A human being." });
    show(read, <TypeTermPopover typeName="t:Person" triggerTestId="trig">Person</TypeTermPopover>);
    const trig = screen.getByTestId("trig");
    fireEvent.click(trig);
    await screen.findByText("A human being.");
    fireEvent.click(trig);
    fireEvent.click(trig);
    expect(screen.getByText("A human being.")).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("Person");
  });

  it("the same popover keeps even an unreachable answer in its own state while it stays mounted (a close and a reopen do not ask again)", async () => {
    const read = reader({ state: "unreachable", reason: "offline" });
    show(read, <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    const trig = screen.getByTestId("trig");
    fireEvent.click(trig);
    await screen.findByText("The definition could not be reached.");
    fireEvent.click(trig);
    fireEvent.click(trig);
    expect(screen.getByText("The definition could not be reached.")).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a fresh popover for the same name asks the reader again after an unreachable answer, and not after a read one", async () => {
    const read = vi.fn<ReadTermDefinition>().mockResolvedValueOnce({ state: "unreachable", reason: "x" }).mockResolvedValue({ state: "defined", does: "A human being." });
    const first = show(read, <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("The definition could not be reached.");
    first.unmount();
    const second = show(read, <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("A human being.");
    second.unmount();
    show(read, <TypeTermPopover typeName="Person" triggerTestId="trig">Person</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("A human being.");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("the address encodes the name as one path part", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="t:Big Chair/1" triggerTestId="trig">x</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("This type has no definition.");
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://ontology.example.test/base/t/Big%20Chair%2F1");
  });

  it("trims the name; only a t: at the very start is removed (a leading space keeps it, and it is then part of the name)", async () => {
    const read = reader({ state: "none" });
    show(read, (
      <>
        <TypeTermPopover typeName="  Person " triggerTestId="a">a</TypeTermPopover>
        <TypeTermPopover typeName=" t:Thing" triggerTestId="b">b</TypeTermPopover>
        <TypeTermPopover typeName="t: Spaced" triggerTestId="c">c</TypeTermPopover>
      </>
    ));
    fireEvent.click(screen.getByTestId("a"));
    await waitFor(() => expect(read).toHaveBeenCalledWith("Person"));
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://ontology.example.test/base/t/Person");
    fireEvent.click(screen.getByTestId("b"));
    await waitFor(() => expect(read).toHaveBeenCalledWith("t:Thing"));
    await waitFor(() => expect(screen.getByRole("link").getAttribute("href")).toBe("https://ontology.example.test/base/t/t%3AThing"));
    fireEvent.click(screen.getByTestId("c"));
    await waitFor(() => expect(read).toHaveBeenCalledWith("Spaced"));
  });

  it("an empty name opens, asks nothing, and says 'Reading the definition…' for good", async () => {
    const read = reader({ state: "none" });
    show(read, <TypeTermPopover typeName="t:" triggerTestId="trig">x</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    const pop = await screen.findByTestId("type-term-popover");
    await new Promise((r) => setTimeout(r, 20));
    expect(read).not.toHaveBeenCalled();
    expect(pop.textContent).toBe("Reading the definition…");
    expect(pop.getAttribute("aria-label")).toBe(" definition");
  });

  it("uses the origin that is set when the link is drawn", async () => {
    setTermOrigin("https://other.example.test:8443");
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">x</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("This type has no definition.");
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://other.example.test:8443/base/t/Person");
  });

  it("with no origin set, the link cannot be drawn: the term-origin error reaches the nearest error boundary", async () => {
    resetTermOrigin();
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
    show(reader({ state: "none" }), (
      <Catch>
        <TypeTermPopover typeName="Person" triggerTestId="trig">x</TypeTermPopover>
      </Catch>
    ));
    fireEvent.click(screen.getByTestId("trig"));
    expect((await screen.findByTestId("caught")).textContent).toBe("term-origin: call setTermOrigin(<origin>) once at start-up");
    quiet.mockRestore();
  });
});

describe("Open in Ontology", () => {
  it("is drawn only when the caller gives onOpenOntology, calls it with the bare name, and shows in every state", async () => {
    const open = vi.fn();
    show(reader({ state: "unreachable", reason: "x" }), (
      <>
        <TypeTermPopover typeName="t:Person" triggerTestId="a" onOpenOntology={open}>a</TypeTermPopover>
      </>
    ));
    fireEvent.click(screen.getByTestId("a"));
    const button = screen.getByRole("button", { name: "Open in Ontology" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith("Person");
    await screen.findByText("The definition could not be reached.");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Open in Ontology" })).toBeTruthy();
  });

  it("is absent without onOpenOntology", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">x</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByText("This type has no definition.");
    expect(screen.queryByRole("button", { name: "Open in Ontology" })).toBeNull();
  });
});

describe("while open it is on the open-popups stack", () => {
  it("registers when it opens, with its element, and leaves when it closes", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">x</TypeTermPopover>);
    expect(topOpen()).toBeNull();
    fireEvent.click(screen.getByTestId("trig"));
    const pop = await screen.findByTestId("type-term-popover");
    const top = topOpen();
    expect(top).not.toBeNull();
    expect(top!.el()).toBe(pop);
    expect(top!.exclusive).toBe(true);
    fireEvent.click(screen.getByTestId("trig"));
    expect(topOpen()).toBeNull();
  });

  it("the stack's close hands the focus back to the trigger; its dismiss does not", async () => {
    show(reader({ state: "none" }), <TypeTermPopover typeName="Person" triggerTestId="trig">x</TypeTermPopover>);
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByTestId("type-term-popover");
    topOpen()!.dismiss!();
    await waitFor(() => expect(screen.queryByTestId("type-term-popover")).toBeNull());
    expect(document.activeElement).not.toBe(screen.getByTestId("trig"));
    fireEvent.click(screen.getByTestId("trig"));
    await screen.findByTestId("type-term-popover");
    topOpen()!.close();
    await waitFor(() => expect(screen.queryByTestId("type-term-popover")).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId("trig"));
  });

  it("opening a second popover closes the first (exclusive), without moving the focus to its trigger", async () => {
    show(reader({ state: "none" }), (
      <>
        <TypeTermPopover typeName="Person" triggerTestId="a" popoverTestId="pa">a</TypeTermPopover>
        <TypeTermPopover typeName="Thing" triggerTestId="b" popoverTestId="pb">b</TypeTermPopover>
      </>
    ));
    fireEvent.click(screen.getByTestId("a"));
    await screen.findByTestId("pa");
    fireEvent.click(screen.getByTestId("b"));
    await screen.findByTestId("pb");
    await waitFor(() => expect(screen.queryByTestId("pa")).toBeNull());
    expect(screen.getByTestId("a").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("closing without the focus", () => {
  const open = async () => {
    show(reader({ state: "none" }), (
      <div>
        <TypeTermPopover typeName="Person" triggerTestId="trig">x</TypeTermPopover>
        <input data-testid="elsewhere" />
      </div>
    ));
    fireEvent.click(screen.getByTestId("trig"));
    return screen.findByTestId("type-term-popover");
  };

  it("a pointer press outside closes it, and the focus stays where the person put it", async () => {
    await open();
    const other = screen.getByTestId("elsewhere");
    other.focus();
    fireEvent.pointerDown(other);
    expect(screen.queryByTestId("type-term-popover")).toBeNull();
    expect(document.activeElement).toBe(other);
  });

  it("a press inside the popover or on the trigger does not close it", async () => {
    const pop = await open();
    fireEvent.pointerDown(pop);
    expect(screen.queryByTestId("type-term-popover")).not.toBeNull();
    fireEvent.pointerDown(screen.getByTestId("trig"));
    expect(screen.queryByTestId("type-term-popover")).not.toBeNull();
  });

  it("a scroll outside closes it; a scroll inside it does not", async () => {
    const pop = await open();
    const inner = document.createElement("div");
    pop.appendChild(inner);
    fireEvent.scroll(inner);
    expect(screen.queryByTestId("type-term-popover")).not.toBeNull();
    fireEvent.scroll(window);
    expect(screen.queryByTestId("type-term-popover")).toBeNull();
  });

  it("a scroll of a list elsewhere on the page closes it", async () => {
    await open();
    fireEvent.scroll(screen.getByTestId("elsewhere"));
    expect(screen.queryByTestId("type-term-popover")).toBeNull();
  });

  it("when closed it listens to nothing: its listeners are removed", async () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    await open();
    expect(add.mock.calls.some((c) => c[0] === "pointerdown" && c[2] === true)).toBe(true);
    fireEvent.click(screen.getByTestId("trig"));
    expect(remove.mock.calls.some((c) => c[0] === "pointerdown" && c[2] === true)).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });
});
