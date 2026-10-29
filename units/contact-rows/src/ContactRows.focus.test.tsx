// After the pick from "Add information" the new row exists and its input has the focus (phone: the country-code box; skill: the picker's search box).
import { AddInformationSheet, addInformation } from "../test/chooser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { render } from "../test/host";
import { patchRecord, readRecord, search } from "../test/records";
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

const none = { values: [], meta: {} };

describe("s10 iter1 — after the pick from + Add information the cursor is in the new field", () => {
  it("email: one new empty row, its box focused; typing goes straight into it", async () => {
    render(card(props({ served: none })));
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Email");
    expect(screen.getAllByTestId("email-row-input")).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByTestId("email-row-input"));
    await userEvent.keyboard("a@b.test");
    expect((screen.getByTestId("email-row-input") as HTMLInputElement).value).toBe("a@b.test");
  });

  it("email picked from presentation (no Edit first): edit mode turns on, the new row's box is focused", async () => {
    render(card(props({ served: none })));
    expect(modeOf()).toBe("presentation");
    await userEvent.click(screen.getByTestId("card-add-info"));
    await userEvent.click(within(screen.getByTestId("add-information-sheet")).getByRole("button", { name: "Email" }));
    expect(modeOf()).toBe("edit");
    expect(document.activeElement).toBe(screen.getByTestId("email-row-input"));
  });

  it("online account: one new empty row, its box focused", async () => {
    render(card(props({ kind: "social", title: "Online Account", served: none })));
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Online Account");
    expect(screen.getAllByTestId("social-row-input")).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByTestId("social-row-input"));
  });

  it("phone: one new empty row, the cursor in the country-code box (after the +)", async () => {
    render(card(props({ kind: "phone", title: "Phone", served: none })));
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Phone");
    expect(screen.getAllByTestId("phone-row")).toHaveLength(1);
    const a = document.activeElement as HTMLElement;
    expect(a.tagName).toBe("INPUT");
    expect(a.getAttribute("aria-label")).toBe("Country code");
    expect(screen.getByTestId("phone-row").contains(a)).toBe(true);
  });

  it("skill: the picker opens and its search box has the focus", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [], items: [] }), { status: 200, headers: { "content-type": "application/json" } })));
    render(card(props({ kind: "skill", title: "Skill", served: none })));
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Skill");
    const dlg = await screen.findByRole("dialog", { name: /skills/i });
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).tagName).toBe("INPUT");
    expect((document.activeElement as HTMLInputElement).type).toBe("search");
    vi.unstubAllGlobals();
  });

  it("the pick adds exactly ONE row (the programmatic add is not repeated by a re-render)", async () => {
    render(card(props({ served: none })));
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Email");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByTestId("email-row-input")).toHaveLength(1);
  });

  it("no focus is taken on loading: a card that opens, with values or without, focuses nothing", async () => {
    render(card(props()));
    expect(document.activeElement).toBe(document.body);
    cleanup();
    render(card(props({ served: none })));
    expect(document.activeElement).toBe(document.body);
  });

  it("Enter and Tab keep their meaning: Enter in the new box leaves it (saves), Tab moves on", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(card(props({ served: none })));
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Email");
    await userEvent.keyboard("a@b.test{Enter}");
    expect(document.activeElement).not.toBe(screen.getByTestId("email-row-input"));
  });
});
