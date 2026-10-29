// New. Pins the export list of the package, so an export added or dropped by a later change is a decision and not an accident.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

const MAPS = ["memberAnswers", "recordReads", "screenAnswerUntil"];

describe("stakeholder-list-state exports", () => {
  it("are exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "deletedLinkedRecords",
      "deletedLinkedRevision",
      "endedLinkedRecords",
      "forgetDeletedLinkedRecord",
      "forgetEndedLinkedRecord",
      "forgetLinkedFinds",
      "forgetLinkedRecords",
      "forgetPageLink",
      "forgetPageLinks",
      "forgetRecordsInView",
      "forgetScreenLinks",
      "isDeletedLinkedRecord",
      "isKeptLinkedRecord",
      "keptResolve",
      "memberAnswers",
      "newestLinkedId",
      "noteJoinedLinkedRecord",
      "notePageLinks",
      "noteRecordInView",
      "onDeletedLinkedRecords",
      "onEndedLinkedRecords",
      "onPageLinks",
      "onRecordsInView",
      "onScreenLinks",
      "pageLinkOf",
      "pageLinksRevision",
      "recordReads",
      "recordsInView",
      "relistLinkedRecord",
      "screenAnswerLapsed",
      "screenAnswerUntil",
      "screenLinkedRecordsOf",
      "screenLinksRevision",
      "screenRecordLinkedTo",
      "setScreenLinks",
      "wasJoinedLinkedRecord",
    ]);
  });
  it("all are functions except the three kept maps", () => {
    for (const [k, v] of Object.entries(unit)) {
      if (MAPS.includes(k)) expect(v).toBeInstanceOf(Map);
      else expect(typeof v).toBe("function");
    }
  });
});
