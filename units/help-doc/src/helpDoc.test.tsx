import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpExample, HelpKeys, HelpLayout, HelpLink, HelpList, HelpNote, HelpSection, HelpSteps } from "./index";

const scroll = vi.fn();

beforeEach(() => {
  scroll.mockReset();
  Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    scroll(this, arg);
  };
});
afterEach(() => cleanup());

describe("HelpSection", () => {
  it("is a section with the id, labelled by its heading whose id is the id plus -h", () => {
    const { container } = render(
      <HelpSection id="first" title="The first">
        <p>body</p>
      </HelpSection>,
    );
    const section = container.querySelector("section") as HTMLElement;
    expect(section.id).toBe("first");
    expect(section.getAttribute("aria-labelledby")).toBe("first-h");
    const heading = screen.getByRole("heading", { level: 2, name: "The first" });
    expect(heading.id).toBe("first-h");
    expect(section.contains(screen.getByText("body"))).toBe(true);
    expect(screen.getByRole("region", { name: "The first" })).toBe(section);
  });

  it("carries the classes that keep a scrolled-to section clear of the top and spaced", () => {
    const { container } = render(
      <HelpSection id="a" title="A">
        x
      </HelpSection>,
    );
    const cls = (container.querySelector("section") as HTMLElement).className;
    for (const c of ["scroll-mt-4", "flex", "flex-col", "gap-3", "pb-8", "text-[16px]", "leading-relaxed", "text-[var(--ink)]"]) {
      expect(cls.split(" ")).toContain(c);
    }
    expect((screen.getByRole("heading") as HTMLElement).className).toBe("text-[20px] font-semibold text-[var(--ink)]");
  });
});

describe("HelpLayout", () => {
  const contents = [
    { id: "one", title: "First part" },
    { id: "two", title: "Second part" },
  ];

  it("draws a nav named Contents with a heading line and one button per entry, in order", () => {
    render(
      <HelpLayout contents={contents}>
        <p>content</p>
      </HelpLayout>,
    );
    const nav = screen.getByRole("navigation", { name: "Contents" });
    expect(within(nav).getByText("Contents").tagName).toBe("P");
    const items = within(nav).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["First part", "Second part"]);
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["First part", "Second part"]);
    for (const b of buttons) expect(b.getAttribute("type")).toBe("button");
    expect(buttons[0]!.className).toContain("min-h-11");
  });

  it("puts the children beside the contents in a column capped at 72 characters", () => {
    const { container } = render(
      <HelpLayout contents={contents}>
        <p data-testid="child">content</p>
      </HelpLayout>,
    );
    const child = screen.getByTestId("child");
    expect((child.parentElement as HTMLElement).className).toBe("max-w-[72ch]");
    expect((child.parentElement!.parentElement as HTMLElement).className).toBe("min-w-0 flex-1");
    expect((container.firstElementChild as HTMLElement).className).toBe("flex flex-col gap-6 md:flex-row md:gap-10");
    expect(screen.getByRole("navigation").className).toContain("md:sticky");
  });

  it("scrolls the target section to the start with smooth behaviour when an entry is pressed", () => {
    render(
      <>
        <HelpLayout contents={contents}>
          <HelpSection id="one" title="First part">
            a
          </HelpSection>
          <HelpSection id="two" title="Second part">
            b
          </HelpSection>
        </HelpLayout>
      </>,
    );
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Second part" }));
    expect(scroll).toHaveBeenCalledTimes(1);
    const [target, arg] = scroll.mock.calls[0]!;
    expect((target as HTMLElement).id).toBe("two");
    expect(arg).toEqual({ block: "start", behavior: "smooth" });
  });

  it("does nothing, and does not throw, when the target id is not in the page", () => {
    render(
      <HelpLayout contents={[{ id: "missing", title: "Gone" }]}>
        <p>x</p>
      </HelpLayout>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Gone" }));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("draws an empty contents list for no entries", () => {
    render(
      <HelpLayout contents={[]}>
        <p>x</p>
      </HelpLayout>,
    );
    expect(within(screen.getByRole("navigation")).queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("HelpLink", () => {
  it("is a button that scrolls to the id it names", () => {
    render(
      <>
        <HelpLink to="there">Go there</HelpLink>
        <div id="there" />
      </>,
    );
    const link = screen.getByRole("button", { name: "Go there" });
    expect(link.getAttribute("type")).toBe("button");
    fireEvent.click(link);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.calls[0]![0] as HTMLElement).id).toBe("there");
    expect(scroll.mock.calls[0]![1]).toEqual({ block: "start", behavior: "smooth" });
  });

  it("does nothing when the id is not in the page", () => {
    render(<HelpLink to="nope">Go</HelpLink>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("is a touch-sized button with an underline on hover", () => {
    render(<HelpLink to="x">Go</HelpLink>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("hover:underline");
    expect(cls).toContain("text-[var(--accent)]");
  });
});

describe("HelpExample", () => {
  it("is a figure with the label as its caption and the text, line breaks kept, in a pre", () => {
    const text = "Keyword:  Sync\nText:     One line.\n\nTag:      X.Sync";
    const { container } = render(<HelpExample label="Example: you type" text={text} />);
    const figure = screen.getByRole("figure");
    expect(within(figure).getByText("Example: you type").tagName).toBe("FIGCAPTION");
    const pre = container.querySelector("pre") as HTMLElement;
    expect(pre.textContent).toBe(text);
    expect(pre.className).toContain("whitespace-pre-wrap");
    expect(pre.className).toContain("font-mono");
  });
});

describe("HelpSteps and HelpList", () => {
  it("HelpSteps is a numbered list of its items", () => {
    const { container } = render(
      <HelpSteps>
        <li>one</li>
        <li>two</li>
      </HelpSteps>,
    );
    const ol = container.querySelector("ol") as HTMLElement;
    expect(ol.className).toContain("list-decimal");
    expect(within(ol).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["one", "two"]);
  });

  it("HelpList is a bulleted list of its items", () => {
    const { container } = render(
      <HelpList>
        <li>a</li>
        <li>b</li>
      </HelpList>,
    );
    const ul = container.querySelector("ul") as HTMLElement;
    expect(ul.className).toContain("list-disc");
    expect(within(ul).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["a", "b"]);
  });
});

describe("HelpNote and HelpKeys", () => {
  it("HelpNote is a div with role note carrying its children, with a bar on the left", () => {
    render(<HelpNote>Careful.</HelpNote>);
    const note = screen.getByRole("note");
    expect(note.tagName).toBe("DIV");
    expect(note.textContent).toBe("Careful.");
    expect(note.className).toContain("border-l-4");
    expect(note.className).toContain("border-[var(--accent)]");
  });

  it("HelpKeys is a kbd in the mono face", () => {
    const { container } = render(<HelpKeys>Esc</HelpKeys>);
    const kbd = container.querySelector("kbd") as HTMLElement;
    expect(kbd.textContent).toBe("Esc");
    expect(kbd.className).toBe("rounded-[var(--r-sm)] border border-[var(--line)] px-1.5 font-mono text-[14px]");
  });
});
