// An online account must be a web address; it is stored as a full link and labelled with its platform when it is a known one.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../test/host";
import { patchRecord } from "../test/records";
import type { ComponentProps } from "react";


import { ContactRows } from "./ContactRows";
import { isWebAddress, normalizeWebAddress, platformOf } from "./onlineAccount";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
});

let seq = 0;
const props = (): ComponentProps<typeof ContactRows> => ({
  kind: "social",
  recordId: `rec-acc-${++seq}`,
  recordEntityUri: null,
  title: "Online Account",
  valueKey: "account",
  metaKey: "fieldMeta",
  served: { values: ["example.test"], meta: { account: { type: "social", order: 6, access: "private", valueIndex: 0 } } },
  etag: "e0",
  canEdit: true,
  onSaved: vi.fn(),
});

describe("online account: a web address, and its platform", () => {
  it("accepts web addresses with or without https://, refuses the rest", () => {
    for (const v of ["example.test", "https://www.linkedin.com/company/marcus-pedersen/", "x.com/ann", "http://sub.example.co.uk/a?b=1"])
      expect(isWebAddress(v), v).toBe(true);
    for (const v of ["jhgfd", "linkedin", "http://", "kai example.test", "ann@example.test"]) expect(isWebAddress(v), v).toBe(false);
  });
  it("stores a full link", () => {
    expect(normalizeWebAddress("example.test")).toBe("https://example.test");
    expect(normalizeWebAddress("http://example.test")).toBe("http://example.test");
  });
  it("recognises the well-known platforms, including sub-domains and old names", () => {
    expect(platformOf("https://www.linkedin.com/in/ann")).toBe("LinkedIn");
    expect(platformOf("twitter.com/kai")).toBe("X");
    expect(platformOf("x.com/ann")).toBe("X");
    expect(platformOf("github.com/KaiGilb")).toBe("GitHub");
    expect(platformOf("no.linkedin.com/in/ann")).toBe("LinkedIn");
    expect(platformOf("example.test")).toBeNull();
    expect(platformOf("notlinkedin.com")).toBeNull();
  });
});

describe("the Online Account section", () => {
  it("'jhgfd' is not saved and the row says why", async () => {
    render(<ContactRows {...props()} />);
    const box = screen.getAllByTestId("social-row-input")[0] as HTMLInputElement;
    fireEvent.change(box, { target: { value: "jhgfd" } });
    fireEvent.blur(box);
    expect(await screen.findByTestId("social-row-format")).toBeTruthy();
    expect(patchRecord).not.toHaveBeenCalled();
  });
  it("a stored value that is not a web address (MyNet allows a handle such as @kai) is kept and never blocks a save", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...{ ...props(), served: { values: ["@ann"], meta: { account: { type: "social", order: 6, access: "private", valueIndex: 0 } } } }} />);
    fireEvent.click(screen.getByTestId("social-add"));
    const box = screen.getAllByTestId("social-row-input")[1] as HTMLInputElement;
    fireEvent.change(box, { target: { value: "github.com/kai" } });
    fireEvent.blur(box);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    expect(patchRecord.mock.calls[0]![1].account).toEqual(["@ann", "https://github.com/kai"]);
    expect(screen.queryByTestId("social-row-format")).toBeNull();
  });

  it("a LinkedIn address is saved as a full link and labelled LinkedIn", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...props()} />);
    const box = screen.getAllByTestId("social-row-input")[0] as HTMLInputElement;
    fireEvent.change(box, { target: { value: "linkedin.com/in/ann" } });
    fireEvent.blur(box);
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const body = patchRecord.mock.calls[0]![1];
    expect(body.account).toEqual(["https://linkedin.com/in/ann"]);
    expect(body.fieldMeta.account.label).toBe("LinkedIn");
  });
});
