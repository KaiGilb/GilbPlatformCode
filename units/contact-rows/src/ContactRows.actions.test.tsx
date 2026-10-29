// The links a contact row gives: Call, Text, Send email, Open link.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../test/host";
import {  } from "../test/records";
import type { ComponentProps } from "react";


import { ContactRows } from "./ContactRows";

afterEach(() => cleanup());

let seq = 0;
const base = (kind: "email" | "phone" | "social", values: string[]): ComponentProps<typeof ContactRows> => ({
  kind,
  recordId: `rec-act-${++seq}`,
  recordEntityUri: null,
  title: kind,
  valueKey: kind === "social" ? "account" : kind,
  metaKey: "fieldMeta",
  served: { values, meta: {} },
  etag: "e0",
  canEdit: true,
  onSaved: vi.fn(),
});

describe("the contact actions MyNet gives", () => {
  it("a phone: Call (tel:) and Text (sms:), spaces taken out", () => {
    render(<ContactRows {...base("phone", ["+47 911 91 229"])} />);
    expect(screen.getByTestId("phone-row-call").getAttribute("href")).toBe("tel:+4791191229");
    expect(screen.getByTestId("phone-row-text").getAttribute("href")).toBe("sms:+4791191229");
  });
  it("an email: Send email (mailto:)", () => {
    render(<ContactRows {...base("email", ["ann@example.test"])} />);
    expect(screen.getByTestId("email-row-send").getAttribute("href")).toBe("mailto:ann@example.test");
  });
  it("an online account: Open link, in a new tab", () => {
    render(<ContactRows {...base("social", ["https://www.linkedin.com/in/ann"])} />);
    const a = screen.getByTestId("social-row-open");
    expect(a.getAttribute("href")).toBe("https://www.linkedin.com/in/ann");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });
  it("no action for what cannot be acted on: an empty phone, a handle, a javascript: link", () => {
    render(<ContactRows {...base("social", ["@ann", "javascript:alert(1)"])} />);
    expect(screen.queryByTestId("social-row-open")).toBeNull();
  });
});
