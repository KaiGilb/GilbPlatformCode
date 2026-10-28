import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import type { ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import type { TypePictureSource } from "@kaigilb/gilbplatformcode-type-picture";
import { CARD_ADD_ATTR } from "@kaigilb/gilbplatformcode-card-group";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { TypeOption, TypeSearchResult } from "@kaigilb/gilbplatformcode-type-chooser";
import { NO_TYPE, PlanTypeField, PlanTypeReplaceAsk, TYPE_TRIGGER_ATTR, termUrlOf } from "./index";

const ORIGIN = "https://ontology.example.test";
const OPEN = `${ORIGIN}/base/t/Open`;
const BLANK = "The types this app ships.";

const read = vi.fn<ReadTermDefinition>(async () => ({ state: "defined", does: "Something that can be opened." }));
const pics: Record<string, string | null> = {};
const source = { fetchTypePictureSrc: vi.fn(async (name: string) => pics[name] ?? null) } as unknown as TypePictureSource;

beforeEach(() => {
  setTermOrigin(ORIGIN);
  read.mockClear();
  vi.mocked(source.fetchTypePictureSrc).mockClear();
  search.mockClear();
  for (const k of Object.keys(pics)) delete pics[k];
});
afterEach(() => {
  cleanup();
  resetTermOrigin();
});

const opts: TypeOption[] = [
  { id: "veda:Person", label: "Person", typeName: "Person", spec: null, kind: "type" },
  { id: "veda:Door", label: "Door", typeName: "Door", spec: null, kind: "type" },
  { id: "veda:Open", label: "Open", typeName: "Open", spec: null, kind: "function" },
  { id: "note", label: "Note", typeName: "NoteDocument", spec: null, kind: "type" },
];
const search = vi.fn(async (): Promise<TypeSearchResult> => ({ options: opts, reach: "test", degraded: false }));

function Providers({ children }: { children: ReactNode }) {
  return (
    <TypePictureSourceContext.Provider value={source}>
      <TermDefinitionContext.Provider value={read}>{children}</TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>
  );
}
const field = (props: Partial<Parameters<typeof PlanTypeField>[0]> = {}) => (
  <Providers>
    <PlanTypeField term="" canEdit editing onChoose={() => undefined} search={search} blankReach={BLANK} {...props} />
  </Providers>
);

describe("exports", () => {
  it("NO_TYPE is 'none' and the trigger attribute is data-plan-type-trigger", () => {
    expect(NO_TYPE).toBe("none");
    expect(TYPE_TRIGGER_ATTR).toBe("data-plan-type-trigger");
  });
  it("termUrlOf builds <term origin>/base/t/<name> with the name as given (not encoded)", () => {
    expect(termUrlOf("Person")).toBe(`${ORIGIN}/base/t/Person`);
    expect(termUrlOf("Big Chair")).toBe(`${ORIGIN}/base/t/Big Chair`);
    setTermOrigin("https://other.example.test:8443");
    expect(termUrlOf("Person")).toBe("https://other.example.test:8443/base/t/Person");
  });
  it("termUrlOf throws the term-origin error when no origin is set", () => {
    resetTermOrigin();
    expect(() => termUrlOf("Person")).toThrow("term-origin: call setTermOrigin(<origin>) once at start-up");
  });
});

describe("what the line shows", () => {
  it("a stored term address shows the type's name as a chip button named 'Type <name>' and a '↗' button named 'About type <name>'", () => {
    render(field({ term: OPEN }));
    const chip = screen.getByRole("button", { name: "Type Open" });
    expect(chip.getAttribute("data-testid")).toBe("plan-type-chip");
    expect(chip.textContent).toBe("Open");
    expect(chip.className).toContain("rounded-full");
    expect(chip.className).toContain("min-h-11");
    const about = screen.getByRole("button", { name: "About type Open" });
    expect(about.getAttribute("data-testid")).toBe("plan-type-about");
    expect(about.textContent).toBe("↗");
    expect(screen.getByTestId("plan-type-field").className).toBe("flex w-full flex-col gap-1 py-2");
  });

  it("an old typed address still shows as the Type (an http address too, in any case)", () => {
    const a = render(field({ term: "http://old.example.test/base/t/Gate" }));
    expect(screen.getByRole("button", { name: "Type Gate" })).toBeTruthy();
    a.unmount();
    render(field({ term: "HTTPS://old.example.test/base/t/Hinge" }));
    expect(screen.getByRole("button", { name: "Type Hinge" })).toBeTruthy();
  });

  it("the name is the last part of the address, decoded; a trailing slash or # is ignored; a bad escape is kept raw", () => {
    const names: Array<[string, string]> = [
      [`${ORIGIN}/base/t/Big%20Chair`, "Big Chair"],
      [`${ORIGIN}/base/t/Open/`, "Open"],
      [`${ORIGIN}/base/t/Open#`, "Open"],
      [`${ORIGIN}/base/t/Open//`, "Open"],
      [`${ORIGIN}/base/t/Bad%E0%A4%A`, "Bad%E0%A4%A"],
      ["https://", "https:"],
    ];
    for (const [term, name] of names) {
      const r = render(field({ term }));
      expect(screen.getByTestId("plan-type-chip").textContent).toBe(name);
      r.unmount();
    }
  });

  it("a stored value that is not an address shows as plain text in a chip, with no popover, picture or arrow", () => {
    render(field({ term: "  Gate idea " }));
    const chip = screen.getByTestId("plan-type-chip");
    expect(chip.tagName).toBe("SPAN");
    expect(chip.textContent).toBe("Gate idea");
    expect(screen.queryByTestId("plan-type-about")).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Change"]);
  });

  it("'none' (even padded) shows 'No GilbVeda type' and a Change control", () => {
    render(field({ term: " none " }));
    expect(screen.getByText("No GilbVeda type")).toBeTruthy();
    expect(screen.queryByTestId("plan-type-chip")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Type" }).textContent).toBe("Change");
  });

  it("no type: in Edit it offers 'Choose a type' (marked as a card add control and as the trigger); in view it shows nothing", () => {
    const a = render(field({ term: "", editing: true }));
    const choose = screen.getByRole("button", { name: "Choose a type" });
    expect(choose.hasAttribute(CARD_ADD_ATTR)).toBe(true);
    expect(choose.hasAttribute(TYPE_TRIGGER_ATTR)).toBe(true);
    expect(choose.className).toBe("min-h-11 px-3 text-[14px] text-[var(--accent)] self-start");
    a.unmount();
    const b = render(field({ term: "", editing: false }));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("plan-type-field").children).toHaveLength(0);
    b.unmount();
    render(field({ term: "", canEdit: false, editing: true }));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("without canEdit there is no Change control, for a type or for 'none'", () => {
    const a = render(field({ term: OPEN, canEdit: false }));
    expect(screen.queryByRole("button", { name: "Edit Type" })).toBeNull();
    a.unmount();
    render(field({ term: "none", canEdit: false }));
    expect(screen.getByText("No GilbVeda type")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Type" })).toBeNull();
  });

  it("Change is marked as the trigger and is not a card add control", () => {
    render(field({ term: OPEN }));
    const change = screen.getByRole("button", { name: "Edit Type" });
    expect(change.hasAttribute(TYPE_TRIGGER_ATTR)).toBe(true);
    expect(change.hasAttribute(CARD_ADD_ATTR)).toBe(false);
    expect(change.getAttribute("type")).toBe("button");
  });
});

describe("the chip opens the type's definition", () => {
  it("the chip, and the arrow, each open a popover with their own testid and the type's definition and link", async () => {
    render(field({ term: OPEN }));
    fireEvent.click(screen.getByTestId("plan-type-chip"));
    const pop = await screen.findByTestId("plan-type-popover");
    expect(pop.getAttribute("aria-label")).toBe("Open definition");
    await screen.findByText("Something that can be opened.");
    expect(read).toHaveBeenCalledWith("Open");
    expect(screen.getByRole("link", { name: /Open in GilbVeda/ }).getAttribute("href")).toBe(`${ORIGIN}/base/t/Open`);
    fireEvent.click(screen.getByTestId("plan-type-about"));
    expect(await screen.findByTestId("plan-type-about-popover")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("plan-type-popover")).toBeNull());
  });

  it("onOpenOntology reaches all three popovers (chip, arrow, picture) and is called with the type's name", async () => {
    pics["Open"] = "https://files.example.test/files/open.png";
    const open = vi.fn();
    render(field({ term: OPEN, onOpenOntology: open }));
    for (const [trigger, popover] of [
      ["plan-type-chip", "plan-type-popover"],
      ["plan-type-about", "plan-type-about-popover"],
      ["plan-type-picture", "plan-type-picture-popover"],
    ] as const) {
      fireEvent.click(await screen.findByTestId(trigger));
      const pop = await screen.findByTestId(popover);
      fireEvent.click(within(pop).getByRole("button", { name: "Open in Ontology" }));
    }
    expect(open.mock.calls).toEqual([["Open"], ["Open"], ["Open"]]);
  });

  it("without onOpenOntology the popovers have no 'Open in Ontology' button", async () => {
    render(field({ term: OPEN }));
    fireEvent.click(screen.getByTestId("plan-type-chip"));
    await screen.findByText("Something that can be opened.");
    expect(screen.queryByRole("button", { name: "Open in Ontology" })).toBeNull();
  });
});

describe("the type's picture (ported from the source's picture cases)", () => {
  it("shows at 20 px before the label; the arrow follows the label; the picture opens its popover", async () => {
    pics["Open"] = "https://files.example.test/files/open.png";
    render(field({ term: OPEN }));
    const g = screen.getByTestId("plan-type-field");
    const img = await waitFor(() => {
      const found = g.querySelector<HTMLImageElement>("img[data-type-picture]");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(img.getAttribute("src")).toBe("https://files.example.test/files/open.png");
    expect(img.style.width).toBe("20px");
    expect(img.style.height).toBe("20px");
    const pic = within(g).getByRole("button", { name: "Type picture: Open" });
    const label = within(g).getByRole("button", { name: "Type Open" });
    const about = within(g).getByRole("button", { name: "About type Open" });
    expect(about.textContent).toBe("↗");
    expect(pic.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pic.className).toContain("min-h-11");
    expect(pic.className).toContain("min-w-11");
    await userEvent.click(pic);
    expect(await screen.findByTestId("plan-type-picture-popover")).toBeTruthy();
  });

  it("a type with no picture draws no image and no picture button, and no space before the label", async () => {
    render(field({ term: OPEN }));
    const g = screen.getByTestId("plan-type-field");
    await waitFor(() => expect(within(g).getByRole("button", { name: "Type Open" })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    expect(g.querySelector("img")).toBeNull();
    expect(within(g).queryByRole("button", { name: "Type picture: Open" })).toBeNull();
  });

  it("a stored value that is not an address has no picture even if the name has one", async () => {
    pics["Gate"] = "https://files.example.test/files/gate.png";
    render(field({ term: "Gate" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(source.fetchTypePictureSrc).not.toHaveBeenCalledWith("Gate");
    expect(screen.getByTestId("plan-type-field").querySelector("img")).toBeNull();
  });
});

describe("choosing", () => {
  const user = () => userEvent.setup();
  const pickOption = async (id: string) => fireEvent.click(await screen.findByTestId(`type-chooser-option-${id}`));

  it("Change opens the picker (the Change control goes), with the type chooser: label Type, ids from 'plan-type', no tabs, no 'name only' hint, the field's placeholder, focus in the box", async () => {
    const onOpenChange = vi.fn();
    render(field({ term: OPEN, onOpenChange }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Type" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId("plan-type-picker")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Type" })).toBeNull();
    const box = screen.getByTestId("type-chooser-search");
    expect(box.id).toBe("plan-type-search");
    expect(box.getAttribute("placeholder")).toBe("Search GilbVeda types…");
    expect(document.activeElement).toBe(box);
    expect(screen.getByText("Type").tagName).toBe("LABEL");
    expect(screen.queryByTestId("type-chooser-plane")).toBeNull();
  });

  it("the chooser is given the field's search and blankReach, and its all-planes list shows the function too, without a 'name only' hint", async () => {
    render(field({ term: "", editing: true }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a type" }));
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe(BLANK);
    expect(await screen.findByTestId("type-chooser-option-veda:Open")).toBeTruthy();
    expect(search).toHaveBeenCalledWith("");
    expect(screen.getByTestId("type-chooser-option-veda:Person").textContent).not.toContain("name only");
  });

  it("renderTypeIcon is passed on to the chooser", async () => {
    render(field({ term: "", renderTypeIcon: (o, className) => <i data-testid={`icon-${o.id}`} className={className} /> }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a type" }));
    expect(await screen.findByTestId("icon-veda:Person")).toBeTruthy();
  });

  it("a pick closes the picker and chooses the term address of the picked type's name", async () => {
    const onChoose = vi.fn();
    const onOpenChange = vi.fn();
    render(field({ term: "", onChoose, onOpenChange }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a type" }));
    await pickOption("veda:Person");
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(`${ORIGIN}/base/t/Person`);
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
    expect(screen.queryByTestId("plan-type-picker")).toBeNull();
  });

  it("the address chosen is built from the picked option's typeName, not its label", async () => {
    const onChoose = vi.fn();
    render(field({ term: "", onChoose }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a type" }));
    await pickOption("note");
    expect(onChoose).toHaveBeenCalledWith(`${ORIGIN}/base/t/NoteDocument`);
  });

  it("'No GilbVeda type' chooses 'none' and closes the picker", async () => {
    const onChoose = vi.fn();
    render(field({ term: "", onChoose }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a type" }));
    fireEvent.click(await screen.findByRole("button", { name: "No GilbVeda type" }));
    expect(onChoose).toHaveBeenCalledWith("none");
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("plan-type-picker")).toBeNull();
  });

  it("Cancel closes the picker and chooses nothing", async () => {
    const onChoose = vi.fn();
    render(field({ term: OPEN, onChoose }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Type" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.queryByTestId("plan-type-picker")).toBeNull();
    expect(screen.getByRole("button", { name: "Type Open" })).toBeTruthy();
  });

  it("Escape on a control in the picker closes it (and does not reach a layer around the field)", async () => {
    const around = vi.fn();
    render(<div onKeyDown={around}>{field({ term: OPEN })}</div>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Type" }));
    const cancel = screen.getByRole("button", { name: "Cancel" });
    fireEvent.keyDown(cancel, { key: "Escape" });
    expect(screen.queryByTestId("plan-type-picker")).toBeNull();
    expect(around).not.toHaveBeenCalled();
  });

  it("Escape typed in the chooser's search box does NOT close the picker (the box keeps its keys to itself)", async () => {
    render(field({ term: OPEN }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Type" }));
    await user().keyboard("{Escape}");
    expect(screen.getByTestId("plan-type-picker")).toBeTruthy();
  });

  it("another key in the picker does not close it", async () => {
    render(field({ term: OPEN }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Type" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Enter" });
    expect(screen.getByTestId("plan-type-picker")).toBeTruthy();
  });

  it("the picker shows even when the stored term is 'none' (the 'No GilbVeda type' line is hidden meanwhile)", () => {
    render(field({ term: "none" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Type" }));
    expect(screen.getByTestId("plan-type-picker")).toBeTruthy();
    expect(screen.queryByText(/^No GilbVeda type$/, { selector: "span" })).toBeNull();
  });

  it("a missing definition reader throws an error naming the provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PlanTypeField term={OPEN} canEdit editing onChoose={() => undefined} search={search} blankReach={BLANK} />)).toThrow(
      "type-term-popover: wrap the app in <TermDefinitionContext.Provider value={readTermDefinition}>",
    );
    quiet.mockRestore();
  });
});

// The form around the field in the source owns the stored term, the earlier concept and the Replace question.
// This stand-in has the same rules (an earlier concept with another address asks first; Keep or Escape writes the
// type only; Replace writes the type and clears the concept) and the same hand-back of the focus when the question closes.
function Form({ concept, writes, askFirst = false }: { concept: string; writes: Array<{ term: string; clear: boolean }>; askFirst?: boolean }) {
  const [term, setTerm] = useState(OPEN);
  const [ask, setAsk] = useState<{ term: string } | null>(null);
  const write = (v: string, clear: boolean) => {
    writes.push({ term: v, clear });
    setTerm(v);
  };
  const question = ask ? (
    <PlanTypeReplaceAsk
      what="Door"
      onKeep={() => {
        write(ask.term, false);
        setAsk(null);
        queueMicrotask(() => document.querySelector<HTMLElement>(`[data-testid="plan-type-field"] [${TYPE_TRIGGER_ATTR}]`)?.focus());
      }}
      onReplace={() => {
        write(ask.term, true);
        setAsk(null);
        queueMicrotask(() => document.querySelector<HTMLElement>(`[data-testid="plan-type-field"] [${TYPE_TRIGGER_ATTR}]`)?.focus());
      }}
    />
  ) : null;
  return (
    <>
      {askFirst ? question : null}
      <PlanTypeField
        term={term}
        canEdit
        editing
        search={search}
        blankReach={BLANK}
        onChoose={(v) => {
          if (concept && concept !== v.trim()) {
            setAsk({ term: v });
            return;
          }
          write(v, !!concept);
        }}
      />
      {askFirst ? null : question}
    </>
  );
}

describe("focus after the picker closes (ported from the source's keyboard probes)", () => {
  const pickPerson = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Edit Type" }));
    await user.click(await screen.findByTestId("type-chooser-option-veda:Person"));
  };

  it("after a pick with no question, focus returns to the Type control (Change), not to body", async () => {
    const user = userEvent.setup();
    const writes: Array<{ term: string; clear: boolean }> = [];
    render(<Providers><Form concept="" writes={writes} /></Providers>);
    await pickPerson(user);
    expect(writes).toEqual([{ term: `${ORIGIN}/base/t/Person`, clear: false }]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Type" })));
  });

  it("after a pick that raises the Replace question, keyboard focus is on the question (not lost to the page)", async () => {
    const user = userEvent.setup();
    const writes: Array<{ term: string; clear: boolean }> = [];
    render(<Providers><Form concept="https://old.example.test/base/t/Door" writes={writes} /></Providers>);
    await pickPerson(user);
    const ask = await screen.findByTestId("plan-type-replace-ask");
    expect(ask.contains(document.activeElement)).toBe(true);
    expect(writes).toEqual([]);
  });

  it("Escape in the Replace question dismisses it (Keep): the type is written, the earlier concept is not cleared, the focus returns to the trigger", async () => {
    const user = userEvent.setup();
    const writes: Array<{ term: string; clear: boolean }> = [];
    render(<Providers><Form concept="https://old.example.test/base/t/Door" writes={writes} /></Providers>);
    await pickPerson(user);
    await screen.findByTestId("plan-type-replace-ask");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("plan-type-replace-ask")).toBeNull();
    expect(writes).toEqual([{ term: `${ORIGIN}/base/t/Person`, clear: false }]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Type" })));
  });

  it("Tab inside the Replace question stays inside it, and Replace writes the type, clears the earlier concept and returns the focus to the trigger", async () => {
    const user = userEvent.setup();
    const writes: Array<{ term: string; clear: boolean }> = [];
    render(<Providers><Form concept="https://old.example.test/base/t/Door" writes={writes} /></Providers>);
    await pickPerson(user);
    const ask = await screen.findByTestId("plan-type-replace-ask");
    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(ask.contains(document.activeElement)).toBe(true);
    }
    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(writes).toEqual([{ term: `${ORIGIN}/base/t/Person`, clear: true }]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Type" })));
  });

  it("the field gives the focus way while the question is on screen, and takes it back to the trigger once it has gone", async () => {
    const user = userEvent.setup();
    const writes: Array<{ term: string; clear: boolean }> = [];
    render(<Providers><Form concept="https://old.example.test/base/t/Door" writes={writes} /></Providers>);
    await pickPerson(user);
    const keep = within(await screen.findByTestId("plan-type-replace-ask")).getByRole("button", { name: "Keep" });
    expect(document.activeElement).toBe(keep);
    await user.click(keep);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Type" })));
  });

  it("a question that is on screen before the field's own hand-back runs keeps the focus: the field does not take it", async () => {
    const user = userEvent.setup();
    const writes: Array<{ term: string; clear: boolean }> = [];
    render(<Providers><Form concept="https://old.example.test/base/t/Door" writes={writes} askFirst /></Providers>);
    await pickPerson(user);
    const keep = within(await screen.findByTestId("plan-type-replace-ask")).getByRole("button", { name: "Keep" });
    await new Promise((r) => setTimeout(r, 30));
    expect(document.activeElement).toBe(keep);
  });

  it("when the picker is closed by Cancel the focus returns to the Change control", async () => {
    const user = userEvent.setup();
    render(field({ term: OPEN }));
    await user.click(screen.getByRole("button", { name: "Edit Type" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Type" })));
  });

  it("the hand-back waits for a trigger: when the card leaves Edit with the pick and the stored term arrives later, the Change control that appears takes the focus", async () => {
    function Late() {
      const [editing, setEditing] = useState(true);
      const [term, setTerm] = useState("");
      const [picked, setPicked] = useState("");
      return (
        <Providers>
          <PlanTypeField
            term={term}
            canEdit
            editing={editing}
            search={search}
            blankReach={BLANK}
            onChoose={(v) => {
              setEditing(false);
              setPicked(v);
            }}
          />
          <button type="button" data-testid="arrive" onClick={() => setTerm(picked)}>
            arrive
          </button>
        </Providers>
      );
    }
    render(<Late />);
    fireEvent.click(screen.getByRole("button", { name: "Choose a type" }));
    fireEvent.click(await screen.findByTestId("type-chooser-option-veda:Person"));
    expect(screen.queryByRole("button", { name: "Edit Type" })).toBeNull();
    const arrive = screen.getByTestId("arrive");
    arrive.focus();
    fireEvent.click(arrive);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Type" })));
  });

  it("the focus does not move to the trigger just because the term changed while the picker was never opened", async () => {
    const r = render(field({ term: OPEN }));
    (document.activeElement as HTMLElement | null)?.blur();
    r.rerender(field({ term: `${ORIGIN}/base/t/Door` }));
    expect(document.activeElement).toBe(document.body);
  });
});
