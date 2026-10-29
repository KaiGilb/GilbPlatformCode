// Pins for what the unit holds itself: the app's `joinPhone` (not the one of `phone-text`), the skill referent, the home dial the host gives, the sidecar key gate.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { fullHost, render } from "../test/host";
import { patchRecord } from "../test/records";
import { ContactRows } from "./ContactRows";
import { joinPhone } from "./dialCode";
import { skillReferentUri } from "./thinSkills";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
});

describe("joinPhone (the app's, a named copy)", () => {
  it.each([
    ["47", "911 11 111", "+47 911 11 111"],
    ["+47", "911", "+47 911"],
    ["47", "", "+47"],
    ["", "911", "911"],
    ["", "", ""],
    ["47", "+44 20 7946", "+44 20 7946"],
    ["47", " +1 555", "+1 555"],
    ["47", "+", "+"],
  ])("joinPhone(%j, %j) is %j", (dial, national, want) => {
    expect(joinPhone(dial, national)).toBe(want);
  });
});

describe("skillReferentUri", () => {
  const skill = (typeUri: string | null) => ({ tag: "nursing", uri: "https://ontology.example.test/base/e/1", typeUri }) as unknown as Parameters<typeof skillReferentUri>[0];
  it("returns the canonical referent", () => {
    expect(skillReferentUri(skill("https://ontology.example.test/base/t/Nursing"))).toBe("https://ontology.example.test/base/t/Nursing");
  });
  it("refuses a storage address, a missing type, another origin and a lower-case name; the error names the origin", () => {
    for (const bad of ["https://ontology.example.test/base/e/1", null, "https://other.example.test/base/t/Nursing", "https://ontology.example.test/base/t/nursing"]) {
      expect(() => skillReferentUri(skill(bad))).toThrow(/https:\/\/ontology\.example\.test\/base\/t\/<PascalName>/);
    }
  });
});

type Props = ComponentProps<typeof ContactRows>;
const phoneProps = (over: Partial<Props> = {}): Props => ({
  kind: "phone",
  recordId: "pin-rec",
  recordEntityUri: null,
  title: "Phone",
  valueKey: "phone",
  metaKey: "fieldMeta",
  served: { values: [], meta: {} },
  etag: "e0",
  canEdit: true,
  onSaved: vi.fn(),
  ...over,
});

describe("the host's home dial", () => {
  it("is asked on every render with one constant empty list, and its digits start a new phone row's code box", () => {
    const seen: unknown[] = [];
    const host = { ...fullHost, useHomeDial: (claims: readonly unknown[]) => (seen.push(claims), "47") };
    render(<ContactRows {...phoneProps()} />, { host });
    fireEvent.click(screen.getByTestId("phone-add"));
    expect((screen.getByTestId("phone-country-code") as HTMLInputElement).value).toBe("+47");
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every((c) => c === seen[0] && (c as unknown[]).length === 0)).toBe(true);
  });
  it("a host without it is refused with a message that names it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useHomeDial: _gone, ...rest } = fullHost;
    expect(() => render(<ContactRows {...phoneProps()} />, { host: rest as never })).toThrow(/has no useHomeDial/);
    spy.mockRestore();
  });
});

describe("the sidecar key gate", () => {
  it("without a metaKey nothing edits, even with a writer", () => {
    render(<ContactRows {...phoneProps({ metaKey: "", served: { values: "+47 900 00 000", meta: {} } })} />);
    expect(screen.queryByTestId("phone-add")).toBeNull();
    expect(screen.queryByTestId("phone-row-remove")).toBeNull();
  });
});
