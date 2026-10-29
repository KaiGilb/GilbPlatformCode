// What the section does when the host leaves a member out: the part that member draws is not drawn, and the rest of the section works. Pins for the named changes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as bareRender, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { fullHost, render } from "../test/host";
import { patchRecord } from "../test/records";
import { ContactRows } from "./ContactRows";
import type { ContactRowsHost } from "./contactRowsHost";

const NURSING = "https://ontology.example.test/base/t/Nursing";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
});

type Props = ComponentProps<typeof ContactRows>;
let seq = 0;
function props(over: Partial<Props> = {}): Props {
  return {
    kind: "skill",
    recordId: `absent-rec-${++seq}`,
    recordEntityUri: null,
    title: "Skill",
    valueKey: "skill",
    metaKey: "fieldMeta",
    served: {
      values: [{ "@id": NURSING }],
      meta: { skill: { type: "skill", label: "nursing", order: 7, access: "private", valueIndex: 0 } },
    },
    etag: "e0",
    canEdit: true,
    onSaved: vi.fn(),
    ...over,
  };
}
const without = (...names: (keyof ContactRowsHost)[]): ContactRowsHost => {
  const h: Record<string, unknown> = { ...fullHost };
  for (const n of names) delete h[n];
  return h as unknown as ContactRowsHost;
};
function notes(over: Record<string, unknown> = {}) {
  return {
    noteFor: () => "ICU nights",
    readError: null,
    errorFor: () => null,
    savingFor: () => false,
    save: async () => true,
    removeFor: async () => true,
    noOwnVault: false,
    editableFor: () => true,
    markFor: () => "private",
    sourceFor: () => ({ item: "https://x.test/claim/1", own: true, hasSource: true }),
    setPrivate: async () => true,
    topics: () => [],
    add: async () => true,
    ...over,
  };
}
const social = (over: Partial<Props> = {}) =>
  props({
    kind: "social",
    title: "Online Account",
    valueKey: "account",
    served: {
      values: "https://www.linkedin.com/in/ann",
      meta: { account: { type: "social", label: "LinkedIn", order: 6, access: "private", valueIndex: 0 } },
    },
    ...over,
  });
const phone = (over: Partial<Props> = {}) =>
  props({
    kind: "phone",
    title: "Phone",
    valueKey: "phone",
    served: { values: "+47 900 00 000", meta: { phone: { type: "phone", order: 4, access: "private", valueIndex: 0 } } },
    ...over,
  });

describe("control: the full host draws every part", () => {
  it("the picker, the depth note, the added-by line and the visibility switch are drawn on an edited skill", () => {
    render(<ContactRows {...props({ skillNotes: notes() } as Partial<Props>)} />);
    expect(screen.getByTestId("skill-depth-note")).toBeTruthy();
    expect(screen.getByTestId("added-by-line")).toBeTruthy();
    expect(screen.getByTestId("held-visibility")).toBeTruthy();
    fireEvent.click(screen.getByTestId("skill-add"));
    expect(screen.getByRole("dialog", { name: "Add skills" })).toBeTruthy();
  });
  it("a social row draws the platform logo, a phone row the phone editor", () => {
    render(<ContactRows {...social()} />);
    expect(screen.getByRole("img", { name: "LinkedIn logo" })).toBeTruthy();
    cleanup();
    render(<ContactRows {...phone()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Phone" }));
    expect(screen.getByTestId("phone-country-code")).toBeTruthy();
  });
});

describe("absent PhoneValue: the phone value is the plain phone text", () => {
  it("shows the number as text, with no edit button, and still the call and text links", () => {
    render(<ContactRows {...phone()} />, { host: without("PhoneValue") });
    expect(screen.getByTestId("phone-row-value").textContent).toBe("+47 900 00 000");
    expect(screen.queryByRole("button", { name: "Edit Phone" })).toBeNull();
    expect(screen.queryByTestId("phone-country-code")).toBeNull();
    expect(screen.getByTestId("phone-row-call")).toBeTruthy();
  });
  it("the add and remove controls are still drawn", () => {
    render(<ContactRows {...phone()} />, { host: without("PhoneValue") });
    expect(screen.getByTestId("phone-add")).toBeTruthy();
    expect(screen.getByTestId("phone-row-remove")).toBeTruthy();
  });
});

describe("absent SkillPickerSheet: the picker is not drawn", () => {
  it("the add control is drawn; pressing it opens nothing", () => {
    render(<ContactRows {...props()} />, { host: without("SkillPickerSheet") });
    fireEvent.click(screen.getByTestId("skill-add"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(patchRecord).not.toHaveBeenCalled();
  });
});

describe("absent SkillDepthNote: no note under a skill", () => {
  it("not drawn while editing, not drawn in presentation, and the skill still shows", () => {
    render(<ContactRows {...props({ skillNotes: notes() } as Partial<Props>)} />, { host: without("SkillDepthNote") });
    expect(screen.queryByTestId("skill-depth-note")).toBeNull();
    expect(screen.getByTestId("skill-row-value").textContent).toContain("nursing");
    expect(screen.getByTestId("added-by-line")).toBeTruthy();
    cleanup();
    render(<ContactRows {...props({ skillNotes: notes(), canEdit: false } as Partial<Props>)} />, { host: without("SkillDepthNote") });
    expect(screen.queryByTestId("skill-depth-note")).toBeNull();
    expect(screen.getByTestId("skill-row-value").textContent).toContain("nursing");
  });
});

describe("absent SocialLogo or socialPlatformName: no logo, the label still shows", () => {
  for (const missing of ["SocialLogo", "socialPlatformName"] as const) {
    it(`without ${missing}, editing: no logo image, the platform label is shown`, () => {
      render(<ContactRows {...social()} />, { host: without(missing) });
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByTestId("social-row-platform").textContent).toContain("LinkedIn");
    });
    it(`without ${missing}, presentation: no logo image, the platform label is shown`, () => {
      render(<ContactRows {...social({ canEdit: false })} />, { host: without(missing) });
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByTestId("social-row-platform").textContent).toContain("LinkedIn");
    });
  }
});

describe("absent HeldVisibilitySwitch and AddedByLine: not drawn", () => {
  it("without the switch, the added-by line stays", () => {
    render(<ContactRows {...props({ skillNotes: notes() } as Partial<Props>)} />, { host: without("HeldVisibilitySwitch") });
    expect(screen.queryByTestId("held-visibility")).toBeNull();
    expect(screen.getByTestId("added-by-line")).toBeTruthy();
  });
  it("without the added-by line, the switch stays", () => {
    render(<ContactRows {...props({ skillNotes: notes() } as Partial<Props>)} />, { host: without("AddedByLine") });
    expect(screen.queryByTestId("added-by-line")).toBeNull();
    expect(screen.getByTestId("held-visibility")).toBeTruthy();
  });
  it("presentation: neither is drawn when both are absent", () => {
    render(<ContactRows {...props({ skillNotes: notes(), canEdit: false } as Partial<Props>)} />, { host: without("HeldVisibilitySwitch", "AddedByLine") });
    expect(screen.queryByTestId("held-visibility")).toBeNull();
    expect(screen.queryByTestId("added-by-line")).toBeNull();
    expect(screen.getByTestId("skill-row-value").textContent).toContain("nursing");
  });
});

describe("absent saveRecordSidecar: the section is read-only", () => {
  it("shows the values with no add, no remove and no edit, and nothing is saved", () => {
    render(<ContactRows {...phone()} />, { host: without("saveRecordSidecar") });
    expect(screen.getByTestId("phone-row-value").textContent).toContain("+47 900 00 000");
    expect(screen.queryByTestId("phone-add")).toBeNull();
    expect(screen.queryByTestId("phone-row-remove")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Phone" })).toBeNull();
    expect(patchRecord).not.toHaveBeenCalled();
  });
  it("a skill section is read-only too", () => {
    render(<ContactRows {...props()} />, { host: without("saveRecordSidecar") });
    expect(screen.queryByTestId("skill-add")).toBeNull();
    expect(screen.queryByTestId("skill-row-remove")).toBeNull();
  });
  it("noteServedVersion alone absent is harmless: the section still saves", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...phone()} />, { host: without("noteServedVersion") });
    fireEvent.click(screen.getByTestId("phone-add"));
    expect(screen.getAllByTestId("phone-row").length).toBeGreaterThan(0);
  });
});

describe("the required hook and the provider", () => {
  it("a host without useHomeDial throws an error that names it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ContactRows {...props()} />, { host: without("useHomeDial") })).toThrow(/has no useHomeDial/);
    spy.mockRestore();
  });
});

describe("no provider", () => {
  it("throws an error that names the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => bareRender(<ContactRows {...props()} />)).toThrow(/ContactRowsHostProvider/);
    spy.mockRestore();
  });
});
