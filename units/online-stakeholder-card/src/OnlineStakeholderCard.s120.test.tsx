/**
 * Gaps on the mid-save branch of "+ Add your own", under the one tag rule: a create that was written and then did not finish. The tag loop (a form
 * tried at a time, a form found taken, the name asked) is gone with the package's tag step: the platform makes the tag. What stays true of a create
 * that was written and did not finish: its copy is removed (newest first), a copy that cannot be removed is named, and the card never says "That name
 * is already used".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@kaigilb/gilbplatformcode-person-create", async (orig) => (await import("../test/mocks")).personCreateMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => (await import("../test/mocks")).lwsRecordsMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-vocabulary", async (orig) => (await import("../test/mocks")).vocabularyMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-state", async (orig) => (await import("../test/mocks")).listStateMock(await orig<{ forgetLinkedFinds: () => void }>()));

import { recordPerson } from "@kaigilb/gilbplatformcode-person-create";
import { PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";
import { forgetLinkedRecords, forgetPageLinks, forgetScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { M, reset } from "../test/mocks";
import { setUp, tearDown } from "../test/support";
import { draw, stubPlatform } from "../test/world";

beforeEach(() => {
  setUp();
  reset();
  stubPlatform();
});
afterEach(() => {
  vi.unstubAllGlobals();
  forgetLinkedRecords();
  forgetPageLinks();
  forgetScreenLinks();
  tearDown();
});

const W = "https://ann.platform.example.test/vault/e/";
/** recordPerson as the package throws it: the record is written, then a later step fails (its tag could not be read or made). */
function midSave() {
  const real = vi.mocked(recordPerson).getMockImplementation()!;
  let n = 0;
  vi.mocked(recordPerson).mockImplementation((async (_host: unknown, _deps: unknown, input: { vault: { vaultId: string } }) => {
    n++;
    M.tags.push("tag" in input ? "tag" : null);
    const rec = `${W}copy${n}`;
    throw new PartialCreateError(`${rec} was created and its tag could not be read or made`, {
      record: rec,
      written: [rec],
      vaultId: input.vault.vaultId,
      cause: new Error("POST /base/tag/ensure 500"),
    });
  }) as never);
  return () => void vi.mocked(recordPerson).mockImplementation(real);
}
async function press() {
  draw();
  await screen.findAllByTitle("Ben Larsen");
  await userEvent.click(screen.getByRole("button", { name: "Add your own card" }));
}

describe("a create that was written and did not finish", () => {
  it("the removal of its own copy fails: the card names the kept copy, no second create, nothing opened", async () => {
    M.deleteFails = new Set(["copy1"]);
    const undo = midSave();
    try {
      await press();
      expect(await screen.findByText(/could not be removed\. Remove it from Records/)).toBeTruthy();
      expect(M.tags).toEqual([null]);
      expect(M.made).toEqual([]);
      expect(M.opened).toEqual([]);
    } finally {
      M.deleteFails = null;
      undo();
    }
  });

  it("the step after the write fails (a 500): the copy is removed, no second create, and the card says it could not be saved", async () => {
    const undo = midSave();
    try {
      await press();
      expect(await screen.findByText(/could not be saved/i)).toBeTruthy();
      expect(M.deleted).toEqual(["copy1"]);
      expect(M.tags).toEqual([null]);
      expect(M.opened).toEqual([]);
      expect(screen.queryByText(/That name is already used in your vault/)).toBeNull();
    } finally {
      undo();
    }
  });

  it("the copy cannot be removed after a failed save: the words name the removal, not a link", async () => {
    M.deleteFails = new Set(["copy1"]);
    const undo = midSave();
    try {
      await press();
      const err = await screen.findByTestId("online-stakeholder-add-error");
      expect(err).toHaveTextContent(/could not be removed/);
      expect(err).not.toHaveTextContent(/could not be linked/);
    } finally {
      M.deleteFails = null;
      undo();
    }
  });
});
