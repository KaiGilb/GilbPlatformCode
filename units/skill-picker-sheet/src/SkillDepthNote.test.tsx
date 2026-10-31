// The "About this skill" block. The first two cases are the source's own (`SkillDepthNote.p4.c214.test.tsx`: only the LATEST
// commit's answer may clear the text the person typed). The rest are new: the source drives the rest only through the rows.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkillDepthNote } from "./SkillDepthNote";

afterEach(() => cleanup());

describe("the latest commit's answer (the source's cases)", () => {
  it("an older commit that answers 'kept' after a newer one answered 'not kept' does not replace the newer text", async () => {
    const pending: Array<(kept: boolean) => void> = [];
    const onCommit = (_next: string) => new Promise<boolean>((r) => pending.push(r));
    const { rerender } = render(<SkillDepthNote skillName="nursing" note="" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    const type = (text: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Edit note for nursing" }));
      const box = screen.getByRole("textbox", { name: "About nursing" });
      fireEvent.change(box, { target: { value: text } });
      fireEvent.blur(box);
    };
    type("A");
    type("AB");
    expect(pending).toHaveLength(2);
    await act(async () => pending[1]!(false)); // "AB": not kept
    await act(async () => pending[0]!(true)); // "A": kept, but older
    // The store now holds "A"; the card is told so.
    rerender(<SkillDepthNote skillName="nursing" note="A" readOnly={false} saving={false} error="not kept" onCommit={onCommit} />);
    expect(screen.getByTestId("skill-depth-note-text").textContent).toBe("AB");
  });

  it("the latest commit answering 'kept' does clear the unconfirmed text (control)", async () => {
    const pending: Array<(kept: boolean) => void> = [];
    const onCommit = (_next: string) => new Promise<boolean>((r) => pending.push(r));
    const { rerender } = render(<SkillDepthNote skillName="nursing" note="" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit note for nursing" }));
    const box = screen.getByRole("textbox", { name: "About nursing" });
    fireEvent.change(box, { target: { value: "A" } });
    fireEvent.blur(box);
    await act(async () => pending[0]!(true));
    rerender(<SkillDepthNote skillName="nursing" note="stored" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    expect(screen.getByTestId("skill-depth-note-text").textContent).toBe("stored");
  });
});

function setup(over: Partial<React.ComponentProps<typeof SkillDepthNote>> = {}) {
  const onCommit = vi.fn(async (_next: string) => true);
  const utils = render(<SkillDepthNote skillName="nursing" note="" readOnly={false} saving={false} error={null} onCommit={onCommit} {...over} />);
  return { onCommit, ...utils };
}
const edit = (name = "nursing") => fireEvent.click(screen.getByRole("button", { name: `Edit note for ${name}` }));
const box = (name = "nursing") => screen.getByRole("textbox", { name: `About ${name}` }) as HTMLTextAreaElement;

describe("when it draws nothing", () => {
  it("while the notes are not read (null), nothing is drawn and nothing is offered", () => {
    const { container } = setup({ note: null });
    expect(container.firstChild).toBeNull();
  });
  it("read-only with no note draws nothing", () => {
    const { container } = setup({ note: "", readOnly: true });
    expect(container.firstChild).toBeNull();
  });
});

describe("what is shown", () => {
  it("the title 'About this skill' and the stored note as a button that names the skill", () => {
    setup({ note: "level: expert" });
    expect(screen.getByText("About this skill")).toBeTruthy();
    const b = screen.getByRole("button", { name: "Edit note for nursing" });
    expect(b.textContent).toBe("level: expert");
    expect(screen.getByTestId("skill-depth-note")).toBeTruthy();
  });
  it("an empty note, on a record that may be written, invites one: 'Add a note about this skill'", () => {
    setup({ note: "" });
    expect(screen.getByRole("button", { name: "Edit note for nursing" }).textContent).toBe("Add a note about this skill");
  });
  it("read-only: the note is text, with no button and no box", () => {
    setup({ note: "level: expert", readOnly: true });
    expect(screen.getByTestId("skill-depth-note-text").textContent).toBe("level: expert");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("saving shows 'Saving…', an error shows its words as an alert", () => {
    setup({ note: "x", saving: true, error: "Could not be saved" });
    expect(screen.getByText("Saving…")).toBeTruthy();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Could not be saved");
    expect(alert.getAttribute("data-testid")).toBe("skill-depth-note-error");
  });
  it("neither saving nor error: neither is drawn", () => {
    setup({ note: "x" });
    expect(screen.queryByText("Saving…")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("the same block under an interest: its words and its test ids", () => {
    setup({ note: "", noun: "interest", skillName: "chess" });
    expect(screen.getByText("About this interest")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit note for chess" }).textContent).toBe("Add a note about this interest");
    expect(screen.getByTestId("interest-note")).toBeTruthy();
    expect(screen.getByTestId("interest-note-text")).toBeTruthy();
    expect(screen.queryByTestId("skill-depth-note")).toBeNull();
  });
});

describe("editing", () => {
  it("pressing the note opens a focused box with the note in it, named by the skill, with the prompt", () => {
    setup({ note: "level: expert" });
    edit();
    const b = box();
    expect(b.value).toBe("level: expert");
    expect(b.placeholder).toBe("Go into more depth — level, context, examples…");
    expect(b.rows).toBe(3);
    expect(document.activeElement).toBe(b);
    expect(screen.queryByRole("button", { name: "Edit note for nursing" })).toBeNull();
  });
  it("leaving the box with a changed text commits it, trimmed, and closes the box", () => {
    const { onCommit } = setup({ note: "old" });
    edit();
    fireEvent.change(box(), { target: { value: "  new text  " } });
    fireEvent.blur(box());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("new text");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("leaving with no change, or only spaces added, commits nothing", () => {
    const { onCommit } = setup({ note: "old" });
    edit();
    fireEvent.blur(box());
    edit();
    fireEvent.change(box(), { target: { value: "  old  " } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("clearing the note commits ''", () => {
    const { onCommit } = setup({ note: "old" });
    edit();
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.blur(box());
    expect(onCommit).toHaveBeenCalledWith("");
  });
  it("Escape reverts the box and closes it without a commit; the next open starts from the note", () => {
    const { onCommit } = setup({ note: "old" });
    edit();
    fireEvent.change(box(), { target: { value: "typed" } });
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
    edit();
    expect(box().value).toBe("old");
  });
  it("another key does not close the box", () => {
    setup({ note: "old" });
    edit();
    fireEvent.keyDown(box(), { key: "a" });
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
  it("a note that arrives while the box is closed is shown, and the next open shows it", () => {
    const onCommit = vi.fn(async () => true);
    const { rerender } = render(<SkillDepthNote skillName="nursing" note="one" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    rerender(<SkillDepthNote skillName="nursing" note="two" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    expect(screen.getByTestId("skill-depth-note-text").textContent).toBe("two");
    edit();
    expect(box().value).toBe("two");
  });
  it("a note that arrives while the person is typing does not replace what they typed", () => {
    const onCommit = vi.fn(async () => true);
    const { rerender } = render(<SkillDepthNote skillName="nursing" note="one" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    edit();
    fireEvent.change(box(), { target: { value: "typing" } });
    rerender(<SkillDepthNote skillName="nursing" note="two" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    expect(box().value).toBe("typing");
  });
});

describe("a committed note the store has not confirmed", () => {
  it("stays on screen in place of the stored one while the store has not confirmed it, and is never dropped when refused", async () => {
    const onCommit = vi.fn(async () => false);
    setup({ note: "old", onCommit });
    edit();
    fireEvent.change(box(), { target: { value: "new" } });
    fireEvent.blur(box());
    await act(async () => {});
    expect(screen.getByTestId("skill-depth-note-text").textContent).toBe("new");
  });
  it("opening the box again shows the unconfirmed text, not the stored one", async () => {
    const onCommit = vi.fn(async () => false);
    setup({ note: "old", onCommit });
    edit();
    fireEvent.change(box(), { target: { value: "new" } });
    fireEvent.blur(box());
    await act(async () => {});
    edit();
    expect(box().value).toBe("new");
  });
  it("is shown even while the notes read as null again (an unconfirmed text keeps the block drawn)", async () => {
    const pending: Array<(kept: boolean) => void> = [];
    const onCommit = (_n: string) => new Promise<boolean>((r) => pending.push(r));
    const { rerender } = render(<SkillDepthNote skillName="nursing" note="old" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    edit();
    fireEvent.change(box(), { target: { value: "new" } });
    fireEvent.blur(box());
    rerender(<SkillDepthNote skillName="nursing" note={null} readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    expect(screen.getByTestId("skill-depth-note-text").textContent).toBe("new");
  });
  it("is shown read-only too, when the unconfirmed text is all there is", async () => {
    const pending: Array<(kept: boolean) => void> = [];
    const onCommit = (_n: string) => new Promise<boolean>((r) => pending.push(r));
    const { rerender } = render(<SkillDepthNote skillName="nursing" note="" readOnly={false} saving={false} error={null} onCommit={onCommit} />);
    edit();
    fireEvent.change(box(), { target: { value: "kept text" } });
    fireEvent.blur(box());
    rerender(<SkillDepthNote skillName="nursing" note="" readOnly saving={false} error={null} onCommit={onCommit} />);
    expect(screen.getByTestId("skill-depth-note-text").textContent).toBe("kept text");
  });
});
