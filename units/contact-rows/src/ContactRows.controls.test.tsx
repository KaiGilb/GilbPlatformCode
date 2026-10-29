// The controls of a row: the remove control at the left, the platform logo of a social row, the cleared address.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../test/host";
import { patchRecord } from "../test/records";
import type { ComponentProps } from "react";


import { ContactRows } from "./ContactRows";

const NURSING = "https://ontology.example.test/base/t/Nursing";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
});

type Props = ComponentProps<typeof ContactRows>;
let seq = 0;
function props(kind: Props["kind"], served: Props["served"], title: string, over: Partial<Props> = {}): Props {
  return { kind, recordId: `s8-${++seq}`, recordEntityUri: null, title, valueKey: kind === "social" ? "account" : kind, metaKey: "fieldMeta", served, etag: "e0", canEdit: true, onSaved: vi.fn(), ...over };
}
const emailP = () =>
  props("email", { values: ["w@x.test"], meta: { email: { type: "email", label: "Work", order: 1, access: "private", valueIndex: 0 } } }, "Email");
const phoneP = () =>
  props("phone", { values: ["+4712345678"], meta: { phone: { type: "phone", order: 1, access: "private", valueIndex: 0 } } }, "Phone");
const socialP = (values: string[], meta: Record<string, unknown>, over: Partial<Props> = {}) =>
  props("social", { values, meta }, "Online Account", over);
const skillP = () =>
  props("skill", { values: [{ "@id": NURSING }], meta: { skill: { type: "skill", label: "nursing", order: 1, access: "private", valueIndex: 0 } } }, "Skill");

/** The one delete control of a row: MyNet's red round (−) — the row's FIRST element, an SVG and no text. */
function expectMinusAtLeft(row: HTMLElement, name: RegExp | string) {
  const btn = within(row).getByRole("button", { name });
  expect(btn.getAttribute("data-remove-control")).toBe("minus-circle");
  expect(btn.textContent).toBe("");
  expect(btn.querySelector("svg")).not.toBeNull();
  expect(row.firstElementChild).toBe(btn);
  expect(btn.className).toContain("size-6");
  return btn;
}

describe("items 2 and 3: the delete is MyNet's (−), at the LEFT of the row it deletes", () => {
  it.each([
    ["email", emailP, /Remove Work email/],
    ["phone", phoneP, /Remove Phone/],
    ["social", () => socialP(["https://x.com/ann"], { account: { type: "social", label: "X", order: 1, access: "private", valueIndex: 0 } }), /Remove Online Account/],
    ["skill", skillP, /Remove Skill nursing/],
  ] as const)("%s: the row's first element is the (−), not a text ×", (kind, mk, name) => {
    render(<ContactRows {...mk()} />);
    const row = screen.getByTestId(`${kind}-row`);
    expectMinusAtLeft(row, name);
    expect(row.textContent ?? "").not.toMatch(/[×✕✖]/);
  });

  it("the (−) still deletes: one save that retracts the row", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...skillP()} />);
    fireEvent.click(within(screen.getByTestId("skill-row")).getByRole("button", { name: /Remove Skill nursing/ }));
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(patchRecord.mock.calls[0]![1].skill).toBeNull();
  });

  it("read-only: no (−) at all", () => {
    render(<ContactRows {...socialP(["https://x.com/ann"], { account: { type: "social", label: "X", order: 1, access: "private", valueIndex: 0 } }, { canEdit: false })} />);
    expect(screen.queryByTestId("social-row-remove")).toBeNull();
  });
});

describe("item 4: a Social row carries the platform's small logo", () => {
  const rowOf = (value: string, label?: string) =>
    socialP([value], { account: { type: "social", ...(label ? { label } : {}), order: 1, access: "private", valueIndex: 0 } });

  it("LinkedIn and X rows show their own logo, named, in front of the platform's name", () => {
    render(<ContactRows {...rowOf("https://www.linkedin.com/in/ann/", "LinkedIn")} />);
    const logo = screen.getByRole("img", { name: "LinkedIn logo" });
    expect(logo.getAttribute("data-social-logo")).toBe("LinkedIn");
    const line = screen.getByTestId("social-row-platform");
    expect(line.firstElementChild).toBe(logo);
    expect(line.textContent).toBe("LinkedIn");
    cleanup();
    render(<ContactRows {...rowOf("https://x.com/ann", "X")} />);
    expect(screen.getByRole("img", { name: "X logo" }).getAttribute("data-social-logo")).toBe("X");
  });

  it("the logo follows what the address says, even when the stored label is older or missing", () => {
    render(<ContactRows {...rowOf("https://github.com/kaigilb")} />);
    expect(screen.getByRole("img", { name: "GitHub logo" })).not.toBeNull();
  });

  it("a site that is not a known platform shows the plain globe, and a row with no address shows no logo", () => {
    render(<ContactRows {...rowOf("https://example.test")} />);
    expect(screen.getByRole("img", { name: "Web address logo" }).getAttribute("data-social-logo")).toBe("web");
    cleanup();
    render(<ContactRows {...socialP([], {})} />);
    fireEvent.click(screen.getByTestId("social-add"));
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("typing a LinkedIn address into a new row brings the LinkedIn logo before it is saved", () => {
    render(<ContactRows {...socialP([], {})} />);
    fireEvent.click(screen.getByTestId("social-add"));
    fireEvent.change(screen.getByTestId("social-row-input"), { target: { value: "linkedin.com/in/ann" } });
    expect(screen.getByRole("img", { name: "LinkedIn logo" })).not.toBeNull();
  });
});

describe("item 4b: an emptied online account is not left behind as an empty \"X\" row", () => {
  const xRow = () => socialP(["https://x.com/ann"], { account: { type: "social", label: "X", order: 1, access: "private", valueIndex: 0 } });

  it("clearing the address stores the row with NO platform label (the label belongs to the value)", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...xRow()} />);
    const input = screen.getByTestId("social-row-input");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const patch = patchRecord.mock.calls[0]![1];
    expect(patch.account).toBeNull();
    expect(patch.fieldMeta.account).toEqual({ type: "social", order: 1, access: "private" });
    // and the row on screen is blank: no logo, no "X"
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByTestId("social-row-label")).toBeNull();
  });

  it("a row stored by an older version (label X, no address) reads as a blank row, with no X", () => {
    render(<ContactRows {...socialP(["https://x.com/ann"], {
      account: { type: "social", label: "X", order: 1, access: "private" },
      account2: { type: "social", label: "X", order: 2, access: "private", valueIndex: 0 },
    })} />);
    const rows = screen.getAllByTestId("social-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).queryByRole("img")).toBeNull();
    expect(within(rows[0]!).queryByTestId("social-row-label")).toBeNull();
    expect(within(rows[1]!).getByRole("img", { name: "X logo" })).not.toBeNull();
  });
});
