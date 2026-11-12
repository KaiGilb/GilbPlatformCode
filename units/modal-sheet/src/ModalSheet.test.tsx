import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ModalSheet } from "./index";

function Opener({ onClose = () => {}, withButtons = true }: { onClose?: () => void; withButtons?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open it</button>
      {open ? (
        <ModalSheet title="Hello" onClose={() => { onClose(); setOpen(false); }}>
          {withButtons ? (<><input aria-label="one" /><button>two</button><button>three</button></>) : <p>text only</p>}
        </ModalSheet>
      ) : null}
    </>
  );
}

describe("the dialog", () => {
  it("is a modal dialog named by its title heading", () => {
    render(<ModalSheet title="Share this" onClose={() => {}}><p>x</p></ModalSheet>);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const heading = screen.getByRole("heading", { name: "Share this" });
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.id).not.toBe("");
    expect(screen.getByRole("dialog", { name: "Share this" })).toBe(dialog);
  });

  it("two dialogs get two different heading ids", () => {
    render(<><ModalSheet title="A" onClose={() => {}}>a</ModalSheet><ModalSheet title="B" onClose={() => {}}>b</ModalSheet></>);
    const [a, b] = screen.getAllByRole("dialog");
    expect(a!.getAttribute("aria-labelledby")).not.toBe(b!.getAttribute("aria-labelledby"));
  });

  it("the close button says closeLabel (default Close) and closes", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<ModalSheet title="T" onClose={onClose}>x</ModalSheet>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<ModalSheet title="T" onClose={onClose} closeLabel="Done">x</ModalSheet>);
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("className is added to the panel", () => {
    render(<ModalSheet title="T" onClose={() => {}} className="mine">x</ModalSheet>);
    expect(screen.getByRole("dialog").className).toBe("ms-panel mine");
  });
});

describe("closing", () => {
  it("Escape closes, once", async () => {
    const onClose = vi.fn();
    render(<ModalSheet title="T" onClose={onClose}><input aria-label="f" /></ModalSheet>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a click on the backdrop closes; a click inside the panel does not", async () => {
    const onClose = vi.fn();
    const { container } = render(<ModalSheet title="T" onClose={onClose}><p>inside</p></ModalSheet>);
    await userEvent.click(screen.getByText("inside"));
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(container.querySelector(".ms-backdrop") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a press that began inside the panel and was released on the backdrop does not close it", async () => {
    const onClose = vi.fn();
    const { container } = render(<ModalSheet title="T" onClose={onClose}><p>inside</p></ModalSheet>);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.mouseDown(screen.getByText("inside"));
    fireEvent.click(container.querySelector(".ms-backdrop") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("focus", () => {
  it("moves to the first focusable thing inside on open, and the opener gets it back on unmount", async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "open it" });
    opener.focus();
    await userEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText("one"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("with nothing focusable in the children it lands on the close button; with initialFocus none, on the panel itself", () => {
    const { unmount } = render(<ModalSheet title="T" onClose={() => {}}><p>text</p></ModalSheet>);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    unmount();
    render(<ModalSheet title="T" onClose={() => {}} initialFocus="none"><input aria-label="f" /></ModalSheet>);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog").getAttribute("tabindex")).toBe("-1");
  });

  it("Tab on the last focusable wraps to the first, and Shift+Tab on the first wraps to the last", async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole("button", { name: "open it" }));
    const first = screen.getByLabelText("one");
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(first);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(close);
    await userEvent.tab();
    expect(document.activeElement).toBe(first);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(close);
    await userEvent.tab();
    expect(document.activeElement).toBe(first);
  });

  it("Tab never leaves the panel, even when focus was lost to the page behind", async () => {
    render(<><button>behind</button><ModalSheet title="T" onClose={() => {}}><input aria-label="f" /></ModalSheet></>);
    (document.activeElement as HTMLElement).blur();
    screen.getByRole("button", { name: "behind" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("works under StrictMode: the opener still gets focus back", async () => {
    render(<StrictMode><Opener /></StrictMode>);
    const opener = screen.getByRole("button", { name: "open it" });
    opener.focus();
    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(opener);
  });
});

describe("page scroll", () => {
  it("is locked while open and gets the previous overflow value back, not an empty one", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = render(<ModalSheet title="T" onClose={() => {}}>x</ModalSheet>);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("gets an unset overflow back as unset", () => {
    document.body.style.overflow = "";
    const { unmount } = render(<ModalSheet title="T" onClose={() => {}}>x</ModalSheet>);
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
