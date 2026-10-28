import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSUMPTION_WARNING } from "@kaigilb/gilbplatformcode-description-parts-model";
import { DESCRIPTION_HELP_SECTIONS, DescriptionHelp, PASTE_HELP_EXAMPLE, PASTE_HELP_EXAMPLE_FUNCTION } from "./index";

afterEach(() => cleanup());

const EN = "–";
const section = (id: string) => document.getElementById(id) as HTMLElement;
const pres = () => [...document.querySelectorAll("pre")].map((p) => p.textContent);

describe("the exported constants", () => {
  it("lists the seven sections with Solution titles, in order", () => {
    expect(DESCRIPTION_HELP_SECTIONS).toEqual([
      { id: "desc-overview", title: "The Description of a Solution" },
      { id: "desc-part", title: "+ Part: add one part" },
      { id: "desc-subpart", title: "Sub-parts: a part under a part" },
      { id: "desc-move", title: "Moving parts (in Edit)" },
      { id: "desc-assumption", title: "+ Assumption: what this Solution takes as true" },
      { id: "desc-paste", title: "Paste parts: add many at once" },
      { id: "desc-source", title: "Sources: who said it" },
    ]);
  });

  it("holds the two paste examples, each with a source on its first line", () => {
    expect(PASTE_HELP_EXAMPLE.split("\n")).toEqual([
      "Bones: The leg has 26 bones. <- Dr Ames",
      "- Hip: The hip joint carries the weight.",
      "- - Socket: A ball in a socket.",
      "Feet: The feet touch the ground.",
      "Assumption:",
      "- Weight: The walker weighs under 120 kg.",
    ]);
    expect(PASTE_HELP_EXAMPLE_FUNCTION.split("\n")).toEqual([
      "Step: The walker puts one foot in front of the other. <- Dr Ames",
      "- Lift: The foot leaves the ground.",
      "- - Swing: The leg swings forward.",
      "Land: The foot touches the ground again.",
      "Assumption:",
      "- Floor: The floor is flat and dry.",
    ]);
  });
});

describe("DescriptionHelp with the default kind", () => {
  it("is a Solution help when no kind is given", () => {
    render(<DescriptionHelp tag="Ben" />);
    expect(screen.getByRole("heading", { level: 2, name: "The Description of a Solution" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "+ Assumption: what this Solution takes as true" })).toBeTruthy();
    expect(section("desc-overview").textContent).toContain("The Description says what this Solution is, one part at a time.");
  });

  it("overview: three ways the card shows the Description", () => {
    render(<DescriptionHelp tag="Ben" />);
    const overview = section("desc-overview");
    expect(overview.textContent).toContain("Bones: The leg has 26 bones.");
    expect(overview.textContent).toContain("Every part is its own record with its own tag, so other plans can point at exactly that part.");
    const items = within(overview).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/^Reading\. Just the parts and who said each one\./);
    expect(items[1]).toMatch(/^One part open\. /);
    expect(items[1]).toContain("Press Esc or click outside to close it.");
    expect(items[2]).toMatch(/^Edit\. You pressed Edit on the card\./);
    expect(overview.querySelector("kbd")?.textContent).toBe("Esc");
  });

  it("+ Part: four steps, the Keyword rule, the reserved Keyword, an example, the used-once note", () => {
    render(<DescriptionHelp tag="Ben" />);
    const part = section("desc-part");
    expect(within(part).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Press Edit on the card.",
      "Press + Part.",
      "Type a Keyword and the text.",
      "Press Add (or Enter).",
    ]);
    expect(part.textContent).toContain("builds its tag: the Solution's tag, a dot, the Keyword.");
    expect(within(part).getByRole("note").textContent).toBe(
      "A tag is used once in the whole vault. If it is taken, you are told, and nothing is written. Pick another Keyword.",
    );
    expect(pres()).toContain(
      "Keyword:  Bones\nText:     The leg has 26 bones.\n\nShows:    Bones: The leg has 26 bones.\nTag:      Ben.Bones",
    );
  });

  it("sub-parts: two ways, the tag rule and the example with the tag", () => {
    render(<DescriptionHelp tag="Ben" />);
    const sub = section("desc-subpart");
    const items = within(sub).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Click the part's text to open it, then press + Sub-part.");
    expect(items[1]).toContain("press → on a part to move it in under the part above it.");
    expect(pres()).toContain(
      `Bones: The leg has 26 bones.             Ben.Bones\n${EN} Hip: The hip joint carries the weight. Ben.Bones.Hip\n${EN} Knee: The knee bends one way.          Ben.Bones.Knee`,
    );
  });

  it("moving: one item for each of the five buttons, and the keep-the-tag note", () => {
    render(<DescriptionHelp tag="Ben" />);
    const move = section("desc-move");
    const items = within(move).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items.map((t) => t[0])).toEqual(["↑", "→", "←", "×", "⠿"]);
    expect(items[0]).toContain("press Try again.");
    expect(items[1]).toContain("as its last sub-part.");
    expect(items[2]).toContain("just after its parent.");
    expect(items[3]).toContain("× refuses when a sub-part cannot be read, when more than 300 parts would go, or when a record in another vault names the part.");
    expect(items[3]).toContain("× refuses a part with more than 12 levels or 300 parts under it. Remove the lower parts first.");
    expect(items[4]).toContain("drag the part anywhere in the tree.");
    expect(within(move).getByRole("note").textContent).toBe(
      "A moved part keeps its tag. Assumptions stay under the Assumption part, and other parts cannot go under it.",
    );
  });

  it("assumption: the warning, the reminder and the example", () => {
    render(<DescriptionHelp tag="Ben" />);
    const a = section("desc-assumption");
    expect(a.textContent).toContain("for example how heavy the walker is");
    expect(a.textContent).toContain("The first + Assumption makes that part for you.");
    expect(a.textContent).toContain(ASSUMPTION_WARNING);
    expect(a.textContent).toContain("If you write one of those words, you get a reminder. The assumption is still saved.");
    expect(pres()).toContain(
      `Keyword:  Weight\nText:     The walker weighs under 120 kg.\n\nShows:    Assumption:\n          ${EN} Weight: The walker weighs under 120 kg.\nTag:      Ben.Assumption.Weight`,
    );
  });

  it("paste: four steps, the table of seven rows, the note and the two examples", () => {
    render(<DescriptionHelp tag="Ben" />);
    const paste = section("desc-paste");
    expect(within(paste).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Press Edit on the card, then Paste parts.",
      "Paste your text, one part per line.",
      "Check the list below the box: each line shows what it will be.",
      "Press Create N parts. Or Discard.",
    ]);
    const headers = within(paste).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Write this", "You get"]);
    const rows = [...paste.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
    expect(rows).toEqual([
      ["Keyword: text", "A part."],
      ["- Keyword: text", "A sub-part of the line above it."],
      ["- - Keyword: text", "One level deeper."],
      ["… <- Name", "At the end of a line: who said it (the source). See Sources: who said it."],
      ["Assumption:", "On its own line. The - Keyword: text lines under it are assumptions."],
      ["Assumption: Keyword: text", "One assumption on one line."],
      ["an empty line", "Skipped."],
    ]);
    expect(within(paste).getByRole("note").textContent).toBe(
      "Only a - in front makes a sub-part. Spaces alone do not: an indented line without - becomes a part at the top.",
    );
    expect(pres()).toContain(PASTE_HELP_EXAMPLE);
    expect(pres()).toContain(
      `Bones: The leg has 26 bones.                 Source: Dr Ames\n${EN} Hip: The hip joint carries the weight.\n  ${EN} Socket: A ball in a socket.\nFeet: The feet touch the ground.\nAssumption:\n${EN} Weight: The walker weighs under 120 kg.`,
    );
    expect(paste.textContent).toContain("If a pasted line's level cannot be read, the whole paste is refused and nothing is written.");
    expect(paste.textContent).toContain("A line that is not a part is marked not a part and is not written.");
  });

  it("source: two steps and the note that Edit hides sources", () => {
    render(<DescriptionHelp tag="Ben" />);
    const src = section("desc-source");
    expect(within(src).getAllByRole("listitem")).toHaveLength(2);
    expect(src.textContent).toContain("If you pick none, the source is you, when the card knows who you are; otherwise it is left empty.");
    expect(within(src).getByRole("note").textContent).toBe("In Edit, sources are hidden so you can see more parts at once. Open a part to set its source.");
  });

  it("each in-page link is a button naming a section that exists", () => {
    render(<DescriptionHelp tag="Ben" />);
    const ids = new Set(DESCRIPTION_HELP_SECTIONS.map((s) => s.id));
    expect(ids.size).toBe(7);
    for (const id of ids) expect(section(id).tagName).toBe("SECTION");
    const nav = screen.getByRole("navigation", { name: "Contents" });
    const links = screen.getAllByRole("button").filter((b) => !nav.contains(b));
    expect(links.map((b) => b.textContent)).toEqual([
      "Moving parts (in Edit)",
      "Moving parts (in Edit)",
      "Sources: who said it",
    ]);
  });
});

describe("the in-page links", () => {
  it("each scrolls the section it names into view", () => {
    const real = Element.prototype.scrollIntoView;
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = function (this: Element) {
      scroll((this as HTMLElement).id);
    };
    try {
      render(<DescriptionHelp tag="Ben" />);
      const nav = screen.getByRole("navigation", { name: "Contents" });
      const links = screen.getAllByRole("button").filter((b) => !nav.contains(b));
      for (const link of links) fireEvent.click(link);
      expect(scroll.mock.calls.map((c) => c[0])).toEqual(["desc-move", "desc-move", "desc-source"]);
    } finally {
      Element.prototype.scrollIntoView = real;
    }
  });
});

describe("the tag prop", () => {
  it("is used in every example tag", () => {
    render(<DescriptionHelp tag="Zed" />);
    const text = pres().join("\n");
    for (const t of ["Zed.Bones", "Zed.Bones.Hip", "Zed.Bones.Knee", "Zed.Assumption.Weight"]) expect(text).toContain(t);
    expect(document.body.textContent).not.toContain("MySolution");
  });

  it("falls back to MySolution when empty, and only when empty (a space is a tag)", () => {
    const { unmount } = render(<DescriptionHelp tag="" />);
    expect(pres().join("\n")).toContain("MySolution.Bones.Hip");
    unmount();
    render(<DescriptionHelp tag=" " />);
    expect(pres().join("\n")).toContain(" .Bones.Hip");
    expect(pres().join("\n")).not.toContain("MySolution");
  });
});

describe("the kind prop", () => {
  it("Function: titles, wording, examples and paste example", () => {
    render(<DescriptionHelp tag="Walk" kind="Function" />);
    expect(screen.getByRole("heading", { level: 2, name: "+ Assumption: what this Function takes as true" })).toBeTruthy();
    expect(section("desc-overview").textContent).toContain("The Description says what this Function is, one part at a time.");
    expect(section("desc-overview").textContent).toContain("Step: The walker puts one foot in front of the other.");
    expect(section("desc-part").textContent).toContain("builds its tag: the Function's tag, a dot, the Keyword.");
    expect(section("desc-assumption").textContent).toContain("for example that the floor is flat");
    expect(pres()).toContain(PASTE_HELP_EXAMPLE_FUNCTION);
    expect(pres()).toContain(
      `Keyword:  Step\nText:     The walker puts one foot in front of the other.\n\nShows:    Step: The walker puts one foot in front of the other.\nTag:      Walk.Step`,
    );
    expect(pres()).toContain(
      `Step: The walker puts one foot in front of the other.  Walk.Step\n${EN} Lift: The foot leaves the ground.${" ".repeat(20)}Walk.Step.Lift\n${EN} Land: The foot touches the ground again.${" ".repeat(13)}Walk.Step.Land`,
    );
    expect(screen.getByText("Example: Step with two sub-parts")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Bones");
  });

  it("Function with an empty tag uses MyFunction", () => {
    render(<DescriptionHelp tag="" kind="Function" />);
    expect(pres().join("\n")).toContain("MyFunction.Step.Lift");
  });

  it("the contents entries follow the kind", () => {
    render(<DescriptionHelp tag="x" kind="Function" />);
    const nav = screen.getByRole("navigation", { name: "Contents" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "The Description of a Function",
      "+ Part: add one part",
      "Sub-parts: a part under a part",
      "Moving parts (in Edit)",
      "+ Assumption: what this Function takes as true",
      "Paste parts: add many at once",
      "Sources: who said it",
    ]);
  });
});
