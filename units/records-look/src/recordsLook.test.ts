import { expect, test } from "vitest";
import {
  folderDoorEntityUri,
  leadWith,
  paramsForFolderEnter,
  paramsForListRowOpen,
  parseView,
  rowOpenAct,
} from "./recordsLook";

test("an unknown look is grid, and only a folder keeps the grid on open", () => {
  expect(parseView("nope")).toBe("grid");
  expect(parseView("both")).toBe("both");
  expect(rowOpenAct("folder")).toBe("detailPaneKeepGrid");
  expect(rowOpenAct(null)).toBe("listRowOpen");
});

test("opening a list row from grid promotes to card; a folder enter does not", () => {
  const opened = paramsForListRowOpen(new URLSearchParams("view=grid"), "n1");
  expect(opened.get("view")).toBe("card");
  expect(opened.get("rec")).toBe("n1");
  const folder = paramsForFolderEnter(new URLSearchParams("view=grid"), "f1");
  expect(folder.get("view")).toBe("grid");
  expect(folder.get("fv")).toBe("f1");
});

test("one row leads and the rest keep their order", () => {
  expect(leadWith(["a", "b", "c"], "b", (item) => item)).toEqual(["b", "a", "c"]);
  expect(leadWith(["a"], "missing", (item) => item)).toEqual(["a"]);
});

test("the folder door is the folder's address, not the selected member", () => {
  expect(folderDoorEntityUri(undefined, "folder-door")).toBe("folder-door");
  expect(folderDoorEntityUri("loaded", "fallback")).toBe("loaded");
});
