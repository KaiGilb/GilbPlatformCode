// New (0.2.0). A skill is shown by its name, never by its address or the last part of an address, in the edit row and in presentation:
// the cached name, else the term's catalogue name from its address, else the word "A skill".
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { render } from "../test/host";
import { patchRecord } from "../test/records";
import { ContactRows } from "./ContactRows";

const ONTOLOGY = "https://ontology.example.test";
const STORAGE = `${ONTOLOGY}/base/e/06gf80rjtdw3h9q187p80kx00m`;
const FOREIGN = "https://elsewhere.example.test/base/t/Welding";

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
});

type Props = ComponentProps<typeof ContactRows>;
let seq = 0;
/** One skill row: `ref` is the picked skill's address, `label` the name the sidecar entry cached (none: undefined). */
function props(ref: string, label: string | undefined, over: Partial<Props> = {}): Props {
  return {
    kind: "skill",
    recordId: `skill-name-${++seq}`,
    recordEntityUri: null,
    title: "Skill",
    valueKey: "skill",
    metaKey: "fieldMeta",
    served: { values: [{ "@id": ref }], meta: label === undefined ? {} : { skill: { type: "skill", label, order: 7, access: "private", valueIndex: 0 } } },
    etag: "e0",
    canEdit: true,
    onSaved: vi.fn(),
    ...over,
  };
}

/** Everything a person can see or hear in the container: the text, every aria-label and every title. */
function seen(root: HTMLElement): string {
  const attrs = [...root.querySelectorAll("[aria-label],[title]")].map((e) => `${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("title") ?? ""}`);
  return `${root.textContent ?? ""} ${attrs.join(" ")}`;
}

const CASES: [string, string, string | undefined, string][] = [
  ["the cached name", `${ONTOLOGY}/base/t/Nursing`, "nursing", "nursing"],
  ["no cached name: the term's catalogue name from its address", `${ONTOLOGY}/base/t/SellProducts`, undefined, "Sell Products"],
  ["no cached name, a storage address: the word", STORAGE, undefined, "A skill"],
  ["no cached name, a foreign origin: the word", FOREIGN, undefined, "A skill"],
];

describe.each(CASES)("a skill row with %s", (_n, ref, label, name) => {
  it("edit row: shows the name; no address and no tail of an address anywhere a person can see", () => {
    const { container } = render(<ContactRows {...props(ref, label)} />);
    expect(screen.getByTestId("skill-row-value").textContent).toContain(name);
    const all = seen(container);
    expect(all).not.toContain("https://");
    expect(all).not.toContain(ref);
    expect(all).not.toContain("06gf80rjtdw3h9q187p80kx00m");
    expect(all).not.toContain("Welding");
    expect(screen.getByRole("button", { name: `Remove Skill ${name}` })).toBeTruthy();
  });
  it("presentation: shows the name; no address and no tail of an address anywhere", () => {
    const { container } = render(
      <CardModeProvider canEdit={false}>
        <ContactRows {...props(ref, label, { canEdit: false })} />
      </CardModeProvider>,
    );
    expect(screen.getAllByTestId("skill-row-value")[0]!.textContent).toContain(name);
    const all = seen(container);
    expect(all).not.toContain("https://");
    expect(all).not.toContain("06gf80rjtdw3h9q187p80kx00m");
    expect(all).not.toContain("Welding");
  });
});

describe("the note under a skill is named by the same name", () => {
  const notesWith = (mark: "private" | "shared" | null) => ({
    noteFor: () => "ICU nights", readError: null, errorFor: () => null, savingFor: () => false, save: async () => true, removeFor: async () => true,
    noOwnVault: false, editableFor: () => true, markFor: () => mark, sourceFor: () => null, setPrivate: async () => true, topics: () => [], add: async () => true,
  });
  it("presentation: the note and the private label name the skill by its term's name, with no address", () => {
    const { container } = render(
      <CardModeProvider canEdit={false}>
        <ContactRows {...props(`${ONTOLOGY}/base/t/SellProducts`, undefined, { canEdit: false, skillNotes: notesWith("private") } as Partial<Props>)} />
      </CardModeProvider>,
    );
    const all = seen(container);
    expect(all).toContain("Sell Products");
    expect(all).not.toContain("https://");
    expect(all).not.toContain("SellProducts");
  });
  it("'About <name>' and 'Edit note for <name>' use the term's name, not the address", () => {
    const notes = {
      noteFor: () => "ICU nights", readError: null, errorFor: () => null, savingFor: () => false, save: async () => true, removeFor: async () => true,
      noOwnVault: false, editableFor: () => true, markFor: () => "private" as const, sourceFor: () => null, setPrivate: async () => true, topics: () => [], add: async () => true,
    };
    const { container } = render(<ContactRows {...props(`${ONTOLOGY}/base/t/SellProducts`, undefined, { skillNotes: notes } as Partial<Props>)} />);
    expect(screen.getByRole("button", { name: "Edit note for Sell Products" })).toBeTruthy();
    expect(seen(container)).not.toContain("https://");
  });
});
