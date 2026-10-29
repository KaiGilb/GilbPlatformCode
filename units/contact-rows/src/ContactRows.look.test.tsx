// The card's look of the rows: values as text in presentation, nothing that edits, no empty rows.
import { AddInformationSheet, addInformation } from "../test/chooser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../test/host";
import { patchRecord, readRecord } from "../test/records";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";


import { ContactRows } from "./ContactRows";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
  readRecord.mockReset();
});

type Props = ComponentProps<typeof ContactRows>;
let seq = 0;
function props(over: Partial<Props> = {}): Props {
  return {
    kind: "email",
    recordId: `rec-${++seq}`,
    recordEntityUri: null,
    title: "Email",
    valueKey: "email",
    metaKey: "fieldMeta",
    served: {
      values: ["w@x.test", "p@x.test"],
      meta: {
        email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 },
        emailPrivate: { type: "email", label: "Private", order: 3, access: "private", valueIndex: 1 },
      },
    },
    etag: "e0",
    canEdit: true,
    onSaved: vi.fn(),
    ...over,
  };
}
const card = (p: Props, canEdit = true) => (
  <CardModeProvider canEdit={canEdit}>
    <CardModeBar />
    <ContactRows {...p} />
    <AddInformationSheet />
  </CardModeProvider>
);
const modeOf = () => screen.getByTestId("card-mode-root").getAttribute("data-card-mode");

describe("PRESENTATION", () => {
  it("shows the values as text, with their Work / Private sub-labels, and nothing that edits", () => {
    render(card(props()));
    expect(modeOf()).toBe("presentation");
    const rows = screen.getAllByTestId("email-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByTestId("email-row-value").textContent).toBe("w@x.test");
    expect(within(rows[0]!).getByTestId("email-row-label").textContent).toBe("Work");
    expect(within(rows[1]!).getByTestId("email-row-label").textContent).toBe("Private");
    expect(screen.queryAllByTestId("email-row-input")).toHaveLength(0);
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(0);
    expect(screen.queryByTestId("email-add")).toBeNull();
    expect(screen.queryByText(/add email/i)).toBeNull();
  });

  it("keeps the action links (Send email) — they are for reading, not for editing", () => {
    render(card(props()));
    expect(screen.getAllByTestId("email-row-send")).toHaveLength(2);
  });

  it("is ONE framed group titled by the master's label, the rows inside it", () => {
    render(card(props()));
    const g = screen.getByRole("region", { name: "Email" });
    expect(within(g).getAllByTestId("email-row")).toHaveLength(2);
    expect(g.querySelector("svg[data-card-icon='email']")).toBeTruthy();
  });

  it("a row with no value is NOT drawn, and a group with no value at all is not drawn", () => {
    render(card(props({ served: { values: ["", "p@x.test"], meta: { email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 }, emailPrivate: { type: "email", label: "Private", order: 3, access: "private", valueIndex: 1 } } } })));
    expect(screen.getAllByTestId("email-row")).toHaveLength(1);
    cleanup();
    render(card(props({ served: { values: [], meta: {} } })));
    expect(screen.queryByTestId("email-rows")).toBeNull();
    expect(screen.queryByRole("region", { name: "Email" })).toBeNull();
  });

  it("a card that may not be written shows the text with no button to edit it", () => {
    render(card(props({ canEdit: false }), false));
    expect(screen.getAllByTestId("email-row-value")[0]!.tagName).toBe("P");
    expect(screen.queryByTestId("card-edit")).toBeNull();
  });

  it("the value is a button of at least 40 px with an accessible name, reachable by keyboard", () => {
    render(card(props()));
    const b = screen.getAllByTestId("email-row-value")[0]!;
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("aria-label")).toBe("Edit Work email");
    expect(b.className).toMatch(/min-h-10/);
    expect(b.className).toMatch(/focus-visible:outline/);
  });

  it("an online account shows its platform logo and name as text, with the open link", () => {
    render(
      card(
        props({
          kind: "social",
          title: "Online account",
          valueKey: "account",
          served: { values: ["https://github.com/ann"], meta: { account: { type: "social", label: "GitHub", order: 1, access: "private", valueIndex: 0 } } },
        }),
      ),
    );
    expect(screen.getByTestId("social-row-platform").textContent).toContain("GitHub");
    expect(screen.getByTestId("social-row-value").textContent).toBe("https://github.com/ann");
    expect(screen.getByTestId("social-row-open")).toBeTruthy();
    expect(screen.queryAllByTestId("social-row-input")).toHaveLength(0);
  });
});

describe("a CLICK into a value is how edit mode starts", () => {
  it("clicking the second email turns edit mode on and puts the cursor in THAT row's box, with the (−) and the add row now shown", async () => {
    render(card(props()));
    await userEvent.click(screen.getAllByTestId("email-row-value")[1]!);
    expect(modeOf()).toBe("edit");
    const boxes = screen.getAllByTestId("email-row-input") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(document.activeElement).toBe(boxes[1]);
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(2);
    expect(screen.getByTestId("email-add")).toBeTruthy();
  });

  it("typing and then pressing Done saves ONCE, with the version the card read, and the card is back in presentation showing the new text", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(card(props()));
    await userEvent.click(screen.getAllByTestId("email-row-value")[0]!);
    const box = screen.getAllByTestId("email-row-input")[0]! as HTMLInputElement;
    fireEvent.change(box, { target: { value: "new@x.test" } });
    await userEvent.click(screen.getByTestId("card-done"));
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(patchRecord.mock.calls[0]![4]).toEqual({ ifMatch: "e0" });
    expect(patchRecord.mock.calls[0]![1].email).toEqual(["new@x.test", "p@x.test"]);
    expect(modeOf()).toBe("presentation");
    expect(screen.getAllByTestId("email-row-value")[0]!.textContent).toBe("new@x.test");
  });

  it("leaving WITHOUT a change writes nothing", async () => {
    render(card(props()));
    await userEvent.click(screen.getAllByTestId("email-row-value")[0]!);
    await userEvent.click(screen.getByTestId("card-done"));
    expect(patchRecord).not.toHaveBeenCalled();
  });

  it("on a card with NO email, the chooser adds the empty group with its add row; adding opens a box ready for typing", async () => {
    render(card(props({ served: { values: [], meta: {} } })));
    expect(screen.queryByTestId("email-rows")).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.queryByTestId("email-rows")).toBeNull(); // edit mode shows what the card has; the rest is ADDED from the chooser
    await addInformation("Email");
    expect(screen.getByTestId("email-rows")).toBeTruthy();
    // s10 iter1: the pick adds the first row and puts the cursor in it; the add row then adds a second, which takes the cursor too
    expect(screen.getAllByTestId("email-row-input")).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getAllByTestId("email-row-input")[0]);
    await userEvent.click(screen.getByTestId("email-add"));
    expect(screen.getAllByTestId("email-row-input")).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getAllByTestId("email-row-input")[1]);
  });

  it("the (−) removes in edit mode (one write); after Done it is gone again", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(card(props()));
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.click(screen.getAllByTestId("email-row-remove")[0]!);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByTestId("card-done"));
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(0);
    expect(screen.getAllByTestId("email-row")).toHaveLength(1);
  });
});

describe("outside a person card (no mode) the section is as it was: always editing", () => {
  it("renders its boxes, (−) and add row with no provider", () => {
    render(<ContactRows {...props()} />);
    expect(screen.getAllByTestId("email-row-input")).toHaveLength(2);
    expect(screen.getByTestId("email-add")).toBeTruthy();
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(2);
  });
});
