// The Skills section, driven as the real component: "Add skills" opens the host's picker, a pick is saved as a reference, a skill is removed; the note under a skill is handed to the notes it was given.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../test/host";
import { patchRecord, search } from "../test/records";
import type { ComponentProps } from "react";


import { ContactRows } from "./ContactRows";

const NURSING = "https://ontology.example.test/base/t/Nursing";
const SELL = "https://ontology.example.test/base/t/SellProducts";
const hit = (tag: string, typeUri: string) => ({ tag, uri: `https://ontology.example.test/base/e/${tag.length}`, typeUri, does: "", escoUri: null, harnessRole: null });

afterEach(() => {
  cleanup();
  patchRecord.mockReset();
  search.mockReset();
});

type Props = ComponentProps<typeof ContactRows>;
let seq = 0;
function props(over: Partial<Props> = {}): Props {
  return {
    kind: "skill",
    recordId: `skill-rec-${++seq}`,
    recordEntityUri: null,
    title: "Skill",
    valueKey: "skill",
    metaKey: "fieldMeta",
    served: {
      values: [{ "@id": NURSING }],
      meta: {
        skill: { type: "skill", label: "nursing", order: 7, access: "private", valueIndex: 0 },
        email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 },
      },
    },
    etag: "e0",
    canEdit: true,
    onSaved: vi.fn(),
    ...over,
  };
}

describe("MyNet's Skills section", () => {
  it("shows a picked skill as MyNet does: its name, and its referent under it; no text box", () => {
    render(<ContactRows {...props()} />);
    expect(screen.getByRole("heading").textContent).toBe("Skill");
    const shown = screen.getByTestId("skill-row-value");
    expect(shown.textContent).toContain("nursing");
    expect(shown.textContent).toContain(NURSING);
    expect(screen.queryByTestId("skill-row-input")).toBeNull();
  });

  it("\"Add skills\" opens MyNet's picker; a pick is saved as a reference with sidecar key skill2", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    search.mockResolvedValue({ skills: [hit("nursing", NURSING), hit("sell products", SELL)], total: { kind: "exact", value: 2 }, complete: true, source: "live-corpus" });
    const p = props();
    render(<ContactRows {...p} />);
    expect(screen.getByTestId("skill-add").textContent).toContain("Add skills");
    fireEvent.click(screen.getByTestId("skill-add"));
    const dialog = screen.getByRole("dialog", { name: "Add skills" });
    expect(dialog).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search skills"), { target: { value: "se" } });
    const choice = await screen.findByRole("button", { name: /sell products/ });
    // The skill the record already holds is not offered again (MyNet excludeUris).
    expect(screen.queryByRole("button", { name: /^nursing/ })).toBeNull();
    fireEvent.click(choice);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const [, patch, , , pre] = patchRecord.mock.calls[0]!;
    expect(pre).toEqual({ ifMatch: "e0" });
    expect(patch.skill).toEqual([{ "@id": NURSING }, { "@id": SELL }]);
    expect(patch.fieldMeta.skill).toEqual({ type: "skill", label: "nursing", order: 7, access: "private", valueIndex: 0 });
    expect(patch.fieldMeta.skill2).toEqual({ type: "skill", label: "sell products", order: 8, access: "private", valueIndex: 1 });
    expect(patch.fieldMeta.email).toEqual({ type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 });
    expect(screen.getAllByTestId("skill-row")).toHaveLength(2);
    await waitFor(() => expect(p.onSaved).toHaveBeenCalled());
  });

  it("the remove control removes the skill: its value goes, its entry is null", async () => {
    patchRecord.mockResolvedValue({ etag: "e1" });
    render(<ContactRows {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Skill nursing" }));
    await waitFor(() => expect(patchRecord).toHaveBeenCalledTimes(1));
    const [, patch] = patchRecord.mock.calls[0]!;
    expect(patch.skill).toBeNull();
    expect(patch.fieldMeta.skill).toBeNull();
    expect(patch.fieldMeta.email).toBeTruthy();
    expect(screen.queryAllByTestId("skill-row")).toHaveLength(0);
  });

  it("read-only: the skill is shown, with no add and no remove", () => {
    render(<ContactRows {...props({ canEdit: false })} />);
    expect(screen.getByTestId("skill-row-value").textContent).toContain("nursing");
    expect(screen.queryByTestId("skill-add")).toBeNull();
    expect(screen.queryByTestId("skill-row-remove")).toBeNull();
  });
});

// Cycle214 step 1e (c) — the section hands each picked skill's note to the notes it was given
// (`skillNotes`, from `useHeldNotes("skill")` via `SkillRows`). The notes state here is a hand-built double
// (MOCK); the store behind it is proved in `SkillRows.c214.test.tsx` and `heldnote/heldNote.c214.test.ts`.
// Spec: Kai 2026-10-14 — "each person have special capabilities … within that, so that is best captured
// with a free text filled in."
describe("Step 1e (c): MyNet's 'About this skill' note under a picked skill", () => {
  function notes(stored: Record<string, string> = {}) {
    return {
      noteFor: vi.fn((skill: string) => stored[skill] ?? ""),
      readError: null,
      errorFor: vi.fn(() => null),
      savingFor: vi.fn(() => false),
      save: vi.fn(async () => true),
      removeFor: vi.fn(async () => true),
      noOwnVault: false,
      editableFor: () => true,
      markFor: () => null,
      sourceFor: () => null,
      setPrivate: async () => true,
      // s7: the shared held-note state also lists its categories and adds one (interests use these).
      topics: vi.fn(() => Object.keys(stored)),
      add: vi.fn(async () => true),
    };
  }

  it("shows the stored note under its skill, and a typed note is handed to save(skill, text)", async () => {
    const n = notes({ [NURSING]: "ICU nights" });
    render(<ContactRows {...props({ skillNotes: n } as Partial<Props>)} />);
    const note = screen.getByTestId("skill-depth-note");
    expect(note.textContent).toContain("About this skill");
    expect(note.textContent).toContain("ICU nights");
    fireEvent.click(screen.getByRole("button", { name: "Edit note for nursing" }));
    const box = screen.getByRole("textbox", { name: "About nursing" });
    fireEvent.change(box, { target: { value: "ICU nights, 8 years" } });
    fireEvent.blur(box);
    await waitFor(() => expect(n.save).toHaveBeenCalledWith(NURSING, "ICU nights, 8 years"));
  });

  it("removing the skill removes its note, only AFTER the card stored the removal", async () => {
    const n = notes({ [NURSING]: "ICU nights" });
    const order: string[] = [];
    patchRecord.mockImplementation(async () => {
      order.push("record stored");
      return { etag: "e1" };
    });
    n.removeFor.mockImplementation(async () => {
      order.push("note removed");
      return true;
    });
    render(<ContactRows {...props({ skillNotes: n } as Partial<Props>)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Skill nursing" }));
    await waitFor(() => expect(n.removeFor).toHaveBeenCalledWith(NURSING));
    expect(order).toEqual(["record stored", "note removed"]);
  });

  it("a refused removal of the skill keeps its note (removeFor is not called)", async () => {
    const n = notes({ [NURSING]: "ICU nights" });
    patchRecord.mockRejectedValue(new Error("403"));
    render(<ContactRows {...props({ skillNotes: n } as Partial<Props>)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Skill nursing" }));
    await screen.findByText(/could not be saved/);
    expect(n.removeFor).not.toHaveBeenCalled();
  });

  it("without notes (no vault to hold them) no note is shown", () => {
    render(<ContactRows {...props()} />);
    expect(screen.queryByTestId("skill-depth-note")).toBeNull();
  });
});
