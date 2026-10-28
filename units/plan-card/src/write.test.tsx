// How the card saves one line: one patch, with the version it was read at as If-Match, through the host; and what it does when the
// save is refused, fails, cannot read the version, or finds the list changed by someone else.
import { describe, expect, test, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { ANN, SCREEN, VAULT, makeApp, mountCard, rowOf, type App } from "../test/app";
import { entityUriOf } from "../test/server";
import { settle } from "../test/helpers";

const LIST_CONFLICT = "This changed elsewhere. The card now shows the latest; your last change was not saved — make it again.";
const STALE_LIST = "This record changed or could not be read — reload before saving";
const VERSION_UNREAD = "This record's version could not be read, so the list was not saved. Reload and try again.";
const SAVE_409 = "Not saved: someone else changed this Value. Reload to see it.";
const SAVE_DOWN = "Not saved: the vault did not answer. Try again.";

/** Type `text` in the method box of one Meter line (HumanAgent, AiAgent or Instrument) and leave it. */
async function writeMeter(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  await user.click(screen.getByRole("button", { name: `Edit ${label}` }));
  const box = screen.getByRole("textbox", { name: `Edit ${label}` });
  await user.type(box, text);
  await user.tab();
}

function setup(over: Parameters<typeof makeApp>[0] = {}, served: Record<string, unknown> = {}, type = "t:Function") {
  const app = makeApp({ ifMatch: true, ...over });
  const row = app.seed("fn1", type, { unitTag: "Content.Measure", ...served });
  const notices: (string | null)[] = [];
  const view = mountCard(app, row, { mode: "legacy", onNotice: (n) => notices.push(n) });
  return { app, row, notices, view, user: userEvent.setup() };
}

describe("one edit is one patch", () => {
  test("goes through the host's patchRecord with the version the record was read at as If-Match", async () => {
    const { app, user, notices } = setup();
    await writeMeter(user, "HumanAgent", "review it");
    await waitFor(() => expect(app.host.patchRecord).toHaveBeenCalledTimes(1));
    const [id, patch, at, source, pre] = app.host.patchRecord.mock.calls[0]!;
    expect(id).toBe("fn1");
    expect(patch).toEqual({ hasMeter: [{ "a:meterAgentKind": "human", "a:method": "review it" }] });
    expect(at).toBe(entityUriOf("fn1"));
    expect(source).toEqual({ at: entityUriOf("fn1"), servedKeys: ["unitTag"] });
    expect(pre).toEqual({ ifMatch: '"v1"' });
    expect(app.server.log).toEqual([{ id: "fn1", body: patch, ifMatch: '"v1"' }]);
    await settle();
    expect(notices[notices.length - 1]).toBeNull();
  });

  test("stores the saved row in the plan vault's lists and in the record's read, with the version the save returned", async () => {
    const { app, user } = setup();
    await writeMeter(user, "AiAgent", "scan");
    await waitFor(() => expect(app.host.storePlanRow).toHaveBeenCalledTimes(1));
    const [vault, stored] = app.host.storePlanRow.mock.calls[0]!;
    expect(vault).toBe(VAULT);
    expect(vault).not.toBe(SCREEN);
    expect(stored.etag).toBe('"v2"');
    expect((stored as GridRecord).served?.facts.hasMeter).toEqual([{ "a:meterAgentKind": "ai", "a:method": "scan" }]);
    expect(typeof (stored as GridRecord).updatedAt).toBe("number");
    expect(app.host.setRecordRead).toHaveBeenCalledTimes(1);
    const [rid, ruri, rrow] = app.host.setRecordRead.mock.calls[0]!;
    expect([rid, ruri]).toEqual(["fn1", entityUriOf("fn1")]);
    expect(rrow).toBe(stored);
  });

  test("the next edit is conditional on the version the last save returned", async () => {
    const { app, user } = setup();
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    await settle();
    await writeMeter(user, "AiAgent", "scan");
    await waitFor(() => expect(app.server.log).toHaveLength(2));
    expect(app.server.log.map((w) => w.ifMatch)).toEqual(['"v1"', '"v2"']);
    expect(app.server.log[1]!.body).toEqual({
      hasMeter: [
        { "a:meterAgentKind": "human", "a:method": "review" },
        { "a:meterAgentKind": "ai", "a:method": "scan" },
      ],
    });
  });

  test("leaving a line as it was writes nothing", async () => {
    const { app, user } = setup({}, { hasMeter: [{ "a:meterAgentKind": "human", "a:method": "review" }] });
    await user.click(screen.getByRole("button", { name: "Edit HumanAgent" }));
    await user.tab();
    await settle();
    expect(app.host.patchRecord).not.toHaveBeenCalled();
    expect(app.server.log).toEqual([]);
  });

  test("a person who is signed in becomes the source of what they wrote; with no self the patch carries no source", async () => {
    const a = setup({ self: { "@id": ANN } });
    await writeMeter(a.user, "HumanAgent", "review");
    await waitFor(() => expect(a.app.server.log).toHaveLength(1));
    expect(a.app.server.log[0]!.body).toEqual({ hasMeter: [{ "a:meterAgentKind": "human", "a:method": "review", "a:statedBy": { "@id": ANN } }] });
    document.body.innerHTML = "";
    const b = setup();
    await writeMeter(b.user, "HumanAgent", "review");
    await waitFor(() => expect(b.app.server.log).toHaveLength(1));
    expect(JSON.stringify(b.app.server.log[0]!.body)).not.toContain("statedBy");
  });

  test("the lists the card knows are asked of the plan vault, the migration of the older Authority of the screen vault", async () => {
    const { app, user } = setup();
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.host.liveRow.mock.calls[0]![0]).toBe(VAULT);
    expect(app.host.ensureEtagUnchanged.mock.calls[0]![0]).toBe(VAULT);
    const migrated = app.host.migratedAuthorityRelation!.mock.calls[0]!;
    expect(migrated[0].id).toBe("fn1");
    expect(migrated[1]).toBe(SCREEN);
  });
});

describe("the older Authority of a record", () => {
  test("is moved to a relation by the next save: the two older facts go in the same patch and the relation joins the record's relations", async () => {
    const { app, user } = setup();
    const relation = { relation: "t:AuthorityOf", uri: ANN, label: "Ann Co" } as never;
    app.host.migratedAuthorityRelation!.mockResolvedValueOnce({ relation });
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.body).toEqual({
      hasMeter: [{ "a:meterAgentKind": "human", "a:method": "review" }],
      authorityHolder: null,
      authorityActsFor: null,
    });
    expect(app.host.setRelations).toHaveBeenCalledWith("fn1", entityUriOf("fn1"), [relation]);
  });

  test("already linked as a relation: the two older facts still go, and no relation is added", async () => {
    const { app, user } = setup();
    app.host.migratedAuthorityRelation!.mockResolvedValueOnce({ relation: null });
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.body).toMatchObject({ authorityHolder: null, authorityActsFor: null });
    expect(app.host.setRelations).not.toHaveBeenCalled();
  });
});

describe("a save the vault refuses with a version conflict (412)", () => {
  test("reconciles the record, says so, and does not send the change again", async () => {
    const { app, user, notices } = setup();
    app.server.stale.add("fn1");
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(app.host.reconcileAfterConflict).toHaveBeenCalledTimes(1));
    expect(app.host.reconcileAfterConflict.mock.calls[0]![0]).toBe(VAULT);
    expect(app.host.reconcileAfterConflict.mock.calls[0]![1].id).toBe("fn1");
    await waitFor(() => expect(notices).toContain(LIST_CONFLICT));
    await settle();
    expect(app.server.log).toHaveLength(1);
    expect(app.host.storePlanRow).not.toHaveBeenCalled();
  });

  test("when another writer's change is the cause, the card shows the latest, not what was typed", async () => {
    const { app, user, notices } = setup();
    const srv = app.server.get("fn1")!;
    srv.served.hasMeter = [{ "a:meterAgentKind": "instrument", "a:method": "probe" }];
    srv.n += 1;
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(notices).toContain(LIST_CONFLICT));
    expect(app.server.log[0]!.ifMatch).toBe('"v1"');
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Instrument" }).textContent).toContain("probe"));
    expect(app.server.get("fn1")!.served.hasMeter).toEqual([{ "a:meterAgentKind": "instrument", "a:method": "probe" }]);
  });

  test("a 409 is not a conflict: the card goes back to the stored value and says someone else changed it", async () => {
    const { app, user, notices } = setup();
    app.host.patchRecord!.mockRejectedValueOnce(Object.assign(new Error("tag taken"), { status: 409 }));
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(notices).toContain(SAVE_409));
    expect(app.host.reconcileAfterConflict).not.toHaveBeenCalled();
    await settle();
    await writeMeter(user, "AiAgent", "scan");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    // The card went back to the stored list, so the refused word is not sent with the next change.
    expect(app.server.log[0]!.body).toEqual({ hasMeter: [{ "a:meterAgentKind": "ai", "a:method": "scan" }] });
  });
});

describe("a save that fails for another reason rolls the card back and says why", () => {
  test("a 5xx says the vault did not answer", async () => {
    const { app, user, notices } = setup();
    app.server.failPatch.add(1);
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(notices).toContain(SAVE_DOWN));
    await settle();
    await writeMeter(user, "AiAgent", "scan");
    await waitFor(() => expect(app.server.log).toHaveLength(2));
    expect(app.server.log[1]!.body).toEqual({ hasMeter: [{ "a:meterAgentKind": "ai", "a:method": "scan" }] });
  });

  test("no answer at all (a TypeError) says the same", async () => {
    const { app, user, notices } = setup();
    app.host.patchRecord!.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(notices).toContain(SAVE_DOWN));
  });

  test("another error is shown with its own message; a thing that is not an error gets the general sentence", async () => {
    const a = setup();
    a.app.host.patchRecord!.mockRejectedValueOnce(new Error("The vault is read only."));
    await writeMeter(a.user, "HumanAgent", "review");
    await waitFor(() => expect(a.notices).toContain("The vault is read only."));
    document.body.innerHTML = "";
    const b = setup();
    b.app.host.patchRecord!.mockRejectedValueOnce("nope");
    await writeMeter(b.user, "HumanAgent", "review");
    await waitFor(() => expect(b.notices).toContain("Couldn't save — your change was rolled back. Try again."));
  });

  test("after a failed save the next edit is written (the queue is not stuck)", async () => {
    const { app, user, notices } = setup();
    app.server.failPatch.add(1);
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(notices).toContain(SAVE_DOWN));
    await settle();
    await writeMeter(user, "AiAgent", "scan");
    await waitFor(() => expect(app.server.log).toHaveLength(2));
    expect(app.server.get("fn1")!.served.hasMeter).toEqual([{ "a:meterAgentKind": "ai", "a:method": "scan" }]);
  });
});

describe("a record whose version is not known", () => {
  function unversioned(app: App, served: Record<string, unknown>): GridRecord {
    const row = rowOf("fn1", "t:Function", { unitTag: "Content.Measure", ...served }, null as unknown as string);
    return { ...row, etag: null, served: { ...row.served!, etag: null } } as GridRecord;
  }

  test("is read before the write; a version that cannot be read writes nothing and says so", async () => {
    const app = makeApp({ ifMatch: true });
    const notices: (string | null)[] = [];
    mountCard(app, unversioned(app, {}), { onNotice: (n) => notices.push(n) });
    const user = userEvent.setup();
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(notices).toContain(VERSION_UNREAD));
    expect(app.host.patchRecord).not.toHaveBeenCalled();
    expect(app.server.log).toEqual([]);
  });

  test("is read, and the write is conditional on the version that read answered", async () => {
    const app = makeApp({ ifMatch: true });
    app.seed("fn1", "t:Function", { unitTag: "Content.Measure" });
    mountCard(app, unversioned(app, {}));
    const user = userEvent.setup();
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.reads.map((r) => r.id)).toContain("fn1");
    expect(app.server.log[0]!.ifMatch).toBe('"v1"');
  });

  test("a list another writer changed is shown and not written over", async () => {
    const app = makeApp({ ifMatch: true });
    app.seed("fn1", "t:Function", { unitTag: "Content.Measure", hasMeter: [{ "a:meterAgentKind": "ai", "a:method": "scan" }] });
    const notices: (string | null)[] = [];
    mountCard(app, unversioned(app, {}), { onNotice: (n) => notices.push(n) });
    const user = userEvent.setup();
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(notices).toContain(LIST_CONFLICT));
    expect(app.server.log).toEqual([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit AiAgent" }).textContent).toContain("scan"));
  });

  test("a save whose answer has no version makes the next save read the record and send that version", async () => {
    const { app, user } = setup();
    const original = app.browser.host.patchRecord;
    app.host.patchRecord!.mockImplementationOnce(async (id, patch, at, source, pre) => {
      await original(id, patch, at, source, { ifMatch: pre?.ifMatch ?? null });
      return { etag: null };
    });
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    await settle();
    const reads = app.server.reads.filter((r) => r.id === "fn1").length;
    await writeMeter(user, "AiAgent", "scan");
    await waitFor(() => expect(app.server.log).toHaveLength(2));
    expect(app.server.reads.filter((r) => r.id === "fn1").length).toBeGreaterThan(reads);
    expect(app.server.log[1]!.ifMatch).toBe('"v2"');
  });
});

describe("a list that changed under the card since it was read", () => {
  test("is not overwritten: the change is dropped, the card says to reload, and nothing is sent", async () => {
    const { app, user, notices } = setup();
    // The app's list now holds a newer copy of the record, with another list in it; the card was drawn from the older one.
    const newer = rowOf("fn1", "t:Function", { unitTag: "Content.Measure", hasMeter: [{ "a:meterAgentKind": "ai", "a:method": "scan" }] }, '"v1"', 5);
    act(() => {
      app.browser.host.storePlanRow(VAULT, newer, { insert: true });
    });
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(notices).toContain(STALE_LIST));
    await settle();
    expect(app.host.patchRecord).not.toHaveBeenCalled();
    expect(app.server.log).toEqual([]);
  });
});

describe("saves are written one after the other", () => {
  test("the second save waits for the first, then carries the version the first returned", async () => {
    const { app, user } = setup();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const original = app.browser.host.patchRecord;
    app.host.patchRecord!.mockImplementationOnce(async (id, patch, at, source, pre) => {
      await held;
      return original(id, patch, at, source, { ifMatch: pre?.ifMatch ?? null });
    });
    await writeMeter(user, "HumanAgent", "review");
    await writeMeter(user, "AiAgent", "scan");
    await waitFor(() => expect(app.host.patchRecord).toHaveBeenCalledTimes(1));
    await settle(60);
    expect(app.host.patchRecord).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(app.server.log).toHaveLength(2));
    expect(app.server.log.map((w) => w.ifMatch)).toEqual(['"v1"', '"v2"']);
    expect((app.server.get("fn1")!.served.hasMeter as unknown[]).length).toBe(2);
  });
});

describe("a Function in another vault than the screen's", () => {
  test("is read and stored in its own vault, not the screen's", async () => {
    const { app, user } = setup();
    await writeMeter(user, "HumanAgent", "review");
    await waitFor(() => expect(app.host.storePlanRow).toHaveBeenCalled());
    for (const call of [...app.host.liveRow.mock.calls, ...app.host.storePlanRow.mock.calls, ...app.host.ensureEtagUnchanged.mock.calls]) {
      expect(call[0]).toBe(VAULT);
    }
    expect(vi.isMockFunction(app.host.liveRow)).toBe(true);
  });
});
