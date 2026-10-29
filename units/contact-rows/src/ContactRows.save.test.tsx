// The section's save path, driven as the real component over the host's writer with `patchRecord` and `readRecord` faked: a save carries If-Match; a 412 re-reads, rebuilds on the stored sidecar and resends once; two quick saves run one at a time on the latest rows; typing during a save is not wiped by the refresh. Then the Phone and Social rows.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../test/host";
import { patchRecord, readRecord, RecordConflictError } from "../test/records";
import type { ComponentProps } from "react";


import { ContactRows } from "./ContactRows";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
  readRecord.mockReset();
});

type Props = ComponentProps<typeof ContactRows>;
let recordSeq = 0;
function props(over: Partial<Props> = {}): Props {
  return {
    kind: "email",
    recordId: `rec-${++recordSeq}`,
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
function held<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const inputs = (kind = "email") => screen.getAllByTestId(`${kind}-row-input`) as HTMLInputElement[];

describe("the row section's save path (Agent.Scaling F10)", () => {
  it("(a) a save carries If-Match: the version the card read", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...props()} />);
    fireEvent.change(inputs()[0]!, { target: { value: "new@x.test" } });
    fireEvent.blur(inputs()[0]!);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const [, patch, , , pre] = patchRecord.mock.calls[0]!;
    expect(pre).toEqual({ ifMatch: "e0" });
    expect(patch.email).toEqual(["new@x.test", "p@x.test"]);
  });

  it("(b) a 412 re-reads, rebuilds on the stored sidecar (keeping a newer entry) and resends once", async () => {
    patchRecord.mockRejectedValueOnce(new RecordConflictError()).mockResolvedValueOnce({ etag: "e2" });
    const phone = { type: "phone", order: 9, access: "private", valueIndex: 0 };
    readRecord.mockResolvedValue({
      etag: "e1",
      served: {
        facts: {
          // The stored record as re-read: its values with its sidecar (it5 B1: the resend is merged on
          // what is stored, so the re-read must carry the values, as a real read does).
          email: ["w@x.test", "p@x.test"],
          fieldMeta: {
            email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 },
            emailPrivate: { type: "email", label: "Private", order: 3, access: "private", valueIndex: 1 },
            phone,
          },
        },
      },
    });
    const p = props();
    render(<ContactRows {...p} />);
    fireEvent.change(inputs()[1]!, { target: { value: "p2@x.test" } });
    fireEvent.blur(inputs()[1]!);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(2));
    expect(readRecord).toHaveBeenCalledTimes(1);
    const [, patch, , , pre] = patchRecord.mock.calls[1]!;
    expect(pre).toEqual({ ifMatch: "e1" });
    expect(patch.fieldMeta.phone).toEqual(phone);
    expect(patch.email).toEqual(["w@x.test", "p2@x.test"]);
    await waitFor(() => expect(p.onSaved).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("(c) two quick saves run one at a time, the second on the latest rows and the first's version", async () => {
    const first = held<{ etag: string }>();
    patchRecord.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ etag: "e2" });
    render(<ContactRows {...props()} />);
    fireEvent.click(screen.getAllByTestId("email-row-label")[0]!); // Work -> Private: save 1
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByTestId("email-row-remove")[1]!); // remove emailPrivate: save 2
    await new Promise((r) => setTimeout(r, 20));
    expect(patchRecord).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve({ etag: "e1" }));
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(2));
    const [, patch, , , pre] = patchRecord.mock.calls[1]!;
    expect(pre).toEqual({ ifMatch: "e1" });
    expect(patch.email).toEqual(["w@x.test"]);
    expect(patch.fieldMeta.email).toMatchObject({ label: "Private", valueIndex: 0 });
    expect(patch.fieldMeta.emailPrivate).toBeNull();
  });

  it("(d) typing during a save is not wiped by the refresh that lands meanwhile or after it", async () => {
    const first = held<{ etag: string }>();
    patchRecord.mockReturnValueOnce(first.promise).mockResolvedValue({ etag: "e9" });
    const p = props();
    const view = render(<ContactRows {...p} />);
    fireEvent.change(inputs()[0]!, { target: { value: "a@x.test" } });
    fireEvent.blur(inputs()[0]!); // save 1 in flight
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    fireEvent.change(inputs()[1]!, { target: { value: "typing@x.test" } }); // typed during the save
    // A refresh lands while the save is in flight: ignored.
    view.rerender(<ContactRows {...p} served={{ values: ["a@x.test", "p@x.test"], meta: p.served.meta }} etag="eX" />);
    expect(inputs()[1]!.value).toBe("typing@x.test");
    await act(async () => first.resolve({ etag: "e1" }));
    await waitFor(() => expect(p.onSaved).toHaveBeenCalledTimes(1));
    // The save's own refresh lands after it: the rows are still dirty, so it is ignored too.
    view.rerender(<ContactRows {...p} served={{ values: ["a@x.test", "p@x.test"], meta: p.served.meta }} etag="e1" />);
    expect(inputs()[0]!.value).toBe("a@x.test");
    expect(inputs()[1]!.value).toBe("typing@x.test");
    // Leaving the box saves it, on the save's own version.
    fireEvent.blur(inputs()[1]!);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(2));
    expect(patchRecord.mock.calls[1]![1].email).toEqual(["a@x.test", "typing@x.test"]);
    expect(patchRecord.mock.calls[1]![4]).toEqual({ ifMatch: "e1" });
  });

  it("a refresh with no edit and no save pending replaces the rows", () => {
    const p = props();
    const view = render(<ContactRows {...p} />);
    view.rerender(<ContactRows {...p} served={{ values: ["z@x.test"], meta: undefined }} />);
    expect(inputs().map((i) => i.value)).toEqual(["z@x.test"]);
  });
});

describe("MyNet's Phone section", () => {
  const phoneProps = (over: Partial<Props> = {}) =>
    props({
      kind: "phone",
      title: "Phone",
      valueKey: "phone",
      served: {
        values: "+47 900 00 000",
        meta: { phone: { type: "phone", order: 4, access: "private", valueIndex: 0 }, email: { type: "email", label: "Work", order: 2, valueIndex: 0 } },
      },
      ...over,
    });

  it("shows the number with no Work / Private label or switch, and edits it with MyNet's PhoneValue", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...phoneProps()} />);
    expect(screen.queryByTestId("phone-row-label")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Phone" }));
    expect((screen.getByTestId("phone-country-code") as HTMLInputElement).value).toBe("+47");
    const national = screen.getByTestId("phone-national");
    fireEvent.change(national, { target: { value: "911 11 111" } });
    fireEvent.keyDown(national, { key: "Enter" });
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const [, patch] = patchRecord.mock.calls[0]!;
    expect(patch.phone).toEqual(["+47 911 11 111"]);
    expect(patch.fieldMeta.phone).toEqual({ type: "phone", order: 4, access: "private", valueIndex: 0 });
    expect(patch.fieldMeta.email).toEqual({ type: "email", label: "Work", order: 2, valueIndex: 0 });
  });

  it("a stored label is shown; add makes `phone2`; remove writes null for the removed row", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(
      <ContactRows
        {...phoneProps({
          served: { values: ["+47 1"], meta: { phone: { type: "phone", label: "Mobile", order: 4, access: "private", valueIndex: 0 } } },
        })}
      />,
    );
    expect(screen.getByTestId("phone-row-label").textContent).toBe("Mobile");
    fireEvent.click(screen.getByTestId("phone-add"));
    expect(screen.getByTestId("phone-add").textContent).toContain("add phone");
    // Kai 2026-10-14: the new row opens ready for typing (no blank "Add phone" to tap first).
    fireEvent.change(screen.getByTestId("phone-country-code"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("phone-national"), { target: { value: "555 0100" } });
    fireEvent.keyDown(screen.getByTestId("phone-national"), { key: "Enter" });
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(patchRecord.mock.calls[0]![1].phone).toEqual(["+47 1", "+1 555 0100"]);
    expect(patchRecord.mock.calls[0]![1].fieldMeta.phone2).toEqual({ type: "phone", order: 5, access: "private", valueIndex: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone Mobile" }));
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(2));
    expect(patchRecord.mock.calls[1]![1].phone).toEqual(["+1 555 0100"]);
    expect(patchRecord.mock.calls[1]![1].fieldMeta.phone).toBeNull();
  });

  it("read-only: the number is shown as text, with no edit, add or remove", () => {
    render(<ContactRows {...phoneProps({ canEdit: false })} />);
    expect(screen.getByTestId("phone-row-value").textContent).toBe("+47 900 00 000");
    expect(screen.queryByTestId("phone-add")).toBeNull();
    expect(screen.queryByTestId("phone-row-remove")).toBeNull();
  });
});

describe("MyNet's Social section (the term `account`, titled with the master's label)", () => {
  it("adds `account2`, saves it under the term's key with sidecar type `social`, and titles the section", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(
      <ContactRows
        {...props({
          kind: "social",
          title: "Online Account",
          valueKey: "account",
          served: { values: "@ann", meta: { account: { type: "social", order: 6, access: "private", valueIndex: 0 } } },
        })}
      />,
    );
    expect(screen.getByRole("heading").textContent).toBe("Online Account");
    expect(screen.queryByTestId("social-row-label")).toBeNull();
    fireEvent.click(screen.getByTestId("social-add"));
    expect(screen.getByTestId("social-add").textContent).toContain("add online account");
    const box = inputs("social")[1]!;
    fireEvent.change(box, { target: { value: "https://x.test/kai" } });
    fireEvent.blur(box);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const [, patch] = patchRecord.mock.calls[0]!;
    expect(patch.account).toEqual(["@ann", "https://x.test/kai"]);
    expect(patch.fieldMeta.account2).toEqual({ type: "social", order: 7, access: "private", valueIndex: 1 });
  });
});

// ── Agent.Scaling it4 (085e810) B1, F11, F12 ──────────────────────────────────────────────────
describe("Agent.Scaling it4: a 412 merges, one version per record, an empty new row does not pin", () => {
  it("B1: the card reads one phone, the person edits it, a Home phone is added elsewhere: the resend keeps both", async () => {
    patchRecord.mockRejectedValueOnce(new RecordConflictError()).mockResolvedValueOnce({ etag: "e2" });
    readRecord.mockResolvedValue({
      etag: "e1",
      served: {
        facts: {
          phone: ["+47 111", "+47 333"],
          fieldMeta: {
            phone: { type: "phone", order: 4, access: "private", valueIndex: 0 },
            phone2: { type: "phone", label: "Home", order: 5, access: "private", valueIndex: 1 },
          },
        },
      },
    });
    const p = props({
      kind: "phone",
      title: "Phone",
      valueKey: "phone",
      served: { values: ["+47 111"], meta: { phone: { type: "phone", order: 4, access: "private", valueIndex: 0 } } },
    });
    render(<ContactRows {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Phone" }));
    fireEvent.change(screen.getByTestId("phone-national"), { target: { value: "222" } });
    fireEvent.keyDown(screen.getByTestId("phone-national"), { key: "Enter" });
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(2));
    expect(patchRecord.mock.calls[0]![1].phone).toEqual(["+47 222"]);
    const [, patch, , , pre] = patchRecord.mock.calls[1]!;
    expect(pre).toEqual({ ifMatch: "e1" });
    expect(patch.phone).toEqual(["+47 222", "+47 333"]);
    expect(patch.fieldMeta.phone).toEqual({ type: "phone", order: 4, access: "private", valueIndex: 0 });
    expect(patch.fieldMeta.phone2).toEqual({ type: "phone", label: "Home", order: 5, access: "private", valueIndex: 1 });
    // The merged rows are shown.
    await waitFor(() => expect(screen.getAllByTestId("phone-row")).toHaveLength(2));
    expect(screen.getByTestId("phone-row-label").textContent).toBe("Home");
  });

  it("F11: a second section's save on the same record sends the version the first one's save left (no 412)", async () => {
    patchRecord.mockResolvedValueOnce({ etag: "e1" }).mockResolvedValueOnce({ etag: "e2" });
    const recordId = `rec-shared-${++recordSeq}`;
    const meta = {
      email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 },
      account: { type: "social", order: 6, access: "private", valueIndex: 0 },
    };
    render(
      <>
        <ContactRows {...props({ recordId, served: { values: ["w@x.test"], meta } })} />
        <ContactRows {...props({ recordId, kind: "social", title: "Online Account", valueKey: "account", served: { values: ["@ann"], meta } })} />
      </>,
    );
    fireEvent.change(inputs()[0]!, { target: { value: "w2@x.test" } });
    fireEvent.blur(inputs()[0]!);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    // Kai 2026-10-14: a typed online account must be a web address (it is stored as a full link).
    fireEvent.change(inputs("social")[0]!, { target: { value: "x.com/ann2" } });
    fireEvent.blur(inputs("social")[0]!);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(2));
    expect(readRecord).not.toHaveBeenCalled();
    const [, patch, , , pre] = patchRecord.mock.calls[1]!;
    expect(pre).toEqual({ ifMatch: "e1" });
    expect(patch.account).toEqual(["https://x.com/ann2"]);
    // The sidecar it is built on is the one the email save left.
    expect(patch.fieldMeta.email).toEqual({ type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 });
  });

  it("F12: a row added and left empty does not block a refresh, and stays below the rows read", () => {
    const p = props({ kind: "social", title: "Online Account", valueKey: "account", served: { values: ["@a"], meta: undefined } });
    const view = render(<ContactRows {...p} />);
    fireEvent.click(screen.getByTestId("social-add"));
    fireEvent.blur(inputs("social")[1]!);
    view.rerender(<ContactRows {...p} served={{ values: ["@a", "@from-mynet"], meta: undefined }} etag="e5" />);
    expect(inputs("social").map((i) => i.value)).toEqual(["@a", "@from-mynet", ""]);
  });
});
