// An address that does not fit name@domain.tld is shown with the reason and never saved.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../test/host";
import { patchRecord } from "../test/records";
import type { ComponentProps } from "react";


import { ContactRows } from "./ContactRows";
import { isEmailFormat } from "./emailFormat";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
});

let seq = 0;
const props = (): ComponentProps<typeof ContactRows> => ({
  kind: "email",
  recordId: `rec-fmt-${++seq}`,
  recordEntityUri: null,
  title: "Email",
  valueKey: "email",
  metaKey: "fieldMeta",
  served: { values: ["w@x.test"], meta: { email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 } } },
  etag: "e0",
  canEdit: true,
  onSaved: vi.fn(),
});

describe("isEmailFormat (xxx@xxx.xxx)", () => {
  it("accepts name@domain.tld and sub-domains", () => {
    for (const v of ["ann@example.test", "a.b+c@mail.example.co.uk", " ann@example.test "]) expect(isEmailFormat(v), v).toBe(true);
  });
  it("refuses what does not fit", () => {
    for (const v of ["kai", "kai@", "kai@gilb", "@example.test", "kai@gilb.", "kai gilb@x.com", "kai@@example.test", "kai@.com"])
      expect(isEmailFormat(v), v).toBe(false);
  });
});

describe("an email row that does not fit is shown, never saved", () => {
  it("'abc' is not saved and the row says why; fixed to a@b.co it is saved and the message goes", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...props()} />);
    const box = screen.getAllByTestId("email-row-input")[0] as HTMLInputElement;
    fireEvent.change(box, { target: { value: "abc" } });
    fireEvent.blur(box);
    expect(await screen.findByTestId("email-row-format")).toBeTruthy();
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(patchRecord).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "a@b.co" } });
    fireEvent.blur(box);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(patchRecord.mock.calls[0]![1].email).toEqual(["a@b.co"]);
    expect(screen.queryByTestId("email-row-format")).toBeNull();
  });
  it("control: emptying a row is allowed (no address is not a bad address)", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...props()} />);
    const box = screen.getAllByTestId("email-row-input")[0] as HTMLInputElement;
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("email-row-format")).toBeNull();
  });
});
