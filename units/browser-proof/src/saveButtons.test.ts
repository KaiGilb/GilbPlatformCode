import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertNoSaveButtons, collectFieldButtons, findChrome, judgeSaveButtons, startBrowser } from "./index.mjs";

const b = (label: string, rowLabels: string[] = []) => ({ label, path: "div.actions", rowLabels });
const rules = (...buttons: ReturnType<typeof b>[]) => judgeSaveButtons(buttons).map((v) => `${v.rule}:${v.path}`);

describe("judgeSaveButtons", () => {
  it("a Save alone is a save-button problem, in one plain sentence", () => {
    expect(judgeSaveButtons([b("Save")])).toEqual([
      { path: "div.actions", rule: "save-button", message: '"Save": a record screen saves as the person types; remove this button (RuleUiSaveAsYouType).' },
    ]);
  });
  it.each(["Save", "save changes", "Done", "Edit", "Apply", "OK", "Save and close", "Save…", "Save...", "Edit profile", "Update", "Submit", "Save as", "Save draft", "Save & close", "Save and continue", "Save changes…", "Done editing", "Apply changes", "Update profile", "Submit form", "Confirm", "Finish"])("%s is a save-button", (label) => {
    expect(judgeSaveButtons([b(label)]).map((v) => v.rule)).toEqual(["save-button"]);
  });
  it("a link or an icon button is judged by the label the page gives it", () => {
    expect(judgeSaveButtons([b("Save"), b("Edit")]).map((v) => v.rule)).toEqual(["save-button", "save-button"]);
  });
  it("Cancel | Save flags both", () => {
    expect(judgeSaveButtons([b("Cancel", ["Save"]), b("Save", ["Cancel"])]).map((v) => v.rule)).toEqual(["cancel-without-act", "save-button"]);
  });
  it("a Cancel alone says there is nothing to cancel", () => {
    expect(judgeSaveButtons([b("Cancel")])[0]!.message).toBe('"Cancel": there is nothing to cancel; fields save as the person types (RuleUiSaveAsYouType).');
  });
  it.each(["Discard", "Discard changes", "Revert"])("%s is flagged without a Delete or Remove beside it", (label) => {
    expect(judgeSaveButtons([b(label)]).map((v) => v.rule)).toEqual(["cancel-without-act"]);
  });
  it("a Cancel in a Delete confirmation row is allowed", () => {
    expect(rules(b("Cancel", ["Delete record"]), b("Delete record", ["Cancel"]))).toEqual([]);
  });
  it("a Cancel beside Remove is allowed", () => {
    expect(rules(b("Cancel", ["Remove"]), b("Remove", ["Cancel"]))).toEqual([]);
  });
  it("a Cancel beside Discard is still flagged", () => {
    expect(rules(b("Cancel", ["Discard"]))).toEqual(["cancel-without-act:div.actions"]);
  });
  it.each(["Saved", "Updates", "Editor", "Add fruit", "Delete", "Share", "Sign out", "Take picture", "Choose from phone", "Remove", "Doner kebab", "Okay then", "Finished items", "Applesauce"])("%s is not flagged", (label) => {
    expect(judgeSaveButtons([b(label)])).toEqual([]);
  });
  it("other buttons pass", () => {
    expect(rules(b("Delete"), b("Share"), b("Add a fruit"), b("Saved items"))).toEqual([]);
  });
});

const chromePath = findChrome();
const html = (body: string) => `data:text/html,${encodeURIComponent(`<!doctype html><meta charset=utf-8><style>button{padding:8px 12px}</style>${body}`)}`;

describe("save buttons in real Chrome", () => {
  const clean = `<main><div id=a><button>Delete</button><button>Share</button></div></main>
    <div role=dialog><div><button>Cancel</button><button>Save</button></div></div>
    <dialog open><button>Cancel</button><button>Done</button></dialog>
    <div data-autosave-ignore><button>Save</button></div>
    <div style="display:none"><button>Save</button></div>`;
  const bad = `<form id=f><button>Cancel</button><button>Save</button></form>`;
  const sneaky = `<div><button aria-label="Save">💾</button><a href="/edit">Edit</a><button title="Update">⟳</button><button>Edit profile</button></div>`;
  it.skipIf(!chromePath)("leaves out dialogs and hidden buttons, and fails on a Cancel | Save form", async () => {
    const work = mkdtempSync(join(tmpdir(), "bp-save-"));
    const { page, close } = await startBrowser({ profileDir: join(work, "profiles"), width: 1280, height: 800 });
    try {
      await page.goto(html(clean));
      expect((await collectFieldButtons(page)).map((x) => x.label)).toEqual(["Delete", "Share"]);
      expect(await assertNoSaveButtons(page)).toBe(2);
      await page.goto(html(bad));
      const found = await collectFieldButtons(page);
      expect(found.map((x) => [x.label, x.rowLabels])).toEqual([["Cancel", ["Save"]], ["Save", ["Cancel"]]]);
      const err = await assertNoSaveButtons(page).then(() => null, (e: Error) => e);
      expect(err).not.toBeNull();
      expect(err!.message).toContain("[cancel-without-act]");
      expect(err!.message).toContain("[save-button]");
      await page.goto(html(sneaky));
      expect((await collectFieldButtons(page)).map((x) => x.label)).toEqual(["Save", "Edit", "Update", "Edit profile"]);
      const err2 = await assertNoSaveButtons(page).then(() => null, (e: Error) => e);
      expect(err2!.message).toContain("4 save-button problems");
    } finally {
      await close();
      rmSync(work, { recursive: true, force: true });
    }
  }, 60000);
  if (!chromePath) it("(skipped: Chrome was not found on this machine)", () => undefined);
});
