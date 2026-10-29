// Ported from the app's test of the session's deleted list: it tells its listeners when it changes, so a screen that follows it
// redraws without waiting for anything else. Same inputs and expectations; the host is example.test.
import { describe, expect, it, vi } from "vitest";
import { deletedLinkedRecords, deletedLinkedRevision, forgetDeletedLinkedRecord, forgetLinkedFinds, forgetLinkedRecords, onDeletedLinkedRecords } from "./linkedAnswers";

describe("the session's deleted list tells its listeners", () => {
  it("a new deleted id tells once (and the revision moves); the same id again tells nothing; sign-out tells; a link write does not", () => {
    forgetLinkedRecords();
    const heard = vi.fn();
    const off = onDeletedLinkedRecords(heard);
    const r0 = deletedLinkedRevision();
    forgetDeletedLinkedRecord("https://a.platform.example.test/vault/e/x1");
    expect(heard).toHaveBeenCalledTimes(1);
    expect(deletedLinkedRevision()).toBe(r0 + 1);
    expect([...deletedLinkedRecords()]).toEqual(["x1"]);
    forgetDeletedLinkedRecord("x1");
    expect(heard).toHaveBeenCalledTimes(1);
    forgetLinkedFinds();
    expect(heard).toHaveBeenCalledTimes(1);
    forgetLinkedRecords();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(deletedLinkedRecords().size).toBe(0);
    off();
    forgetDeletedLinkedRecord("x2");
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
