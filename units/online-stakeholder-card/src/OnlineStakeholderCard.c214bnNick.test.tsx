// An online-only person's nickname sits directly under the family name.
// The kind's fields stay in term-IRI order (Birthday, Family Name, Given Name, Nickname). Nothing else moves.
// Birthday stays first; Family stays before Given. Without a nickname value the order is that IRI order.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@kaigilb/gilbplatformcode-person-create", async (orig) => (await import("../test/mocks")).personCreateMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => (await import("../test/mocks")).lwsRecordsMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-vocabulary", async (orig) => (await import("../test/mocks")).vocabularyMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-state", async (orig) => (await import("../test/mocks")).listStateMock(await orig<{ forgetLinkedFinds: () => void }>()));

import { forgetLinkedRecords } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { forgetPageLinks, forgetScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { reset, VOCAB } from "../test/mocks";
import { setUp, tearDown } from "../test/support";
import { draw, personFields, stubPlatform } from "../test/world";

/** Term-IRI order, the order the kind's field set is stored in. Nickname is last. */
const KIND_FIELDS = personFields([
  ["Birthday", "Birthday", "birthday"],
  ["FamilyName", "Family Name", "familyName"],
  ["GivenName", "Given Name", "givenName"],
  ["Nickname", "Nickname", "nickname"],
]);

/** Null: their card carries no nickname. Otherwise the nickname value (the public-card fields are NOT in IRI order). */
let theirNickname: string | null = "Jai";

beforeEach(() => {
  setUp();
  reset();
  VOCAB.fields = KIND_FIELDS;
  theirNickname = "Jai";
  stubPlatform({ ben: { given: "Ada", family: "Lovelace", email: null, nickname: theirNickname, birthday: "1980-03-14" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  forgetLinkedRecords();
  forgetPageLinks();
  forgetScreenLinks();
  tearDown();
});

/** The online-only group cards, in the order the pane draws them. */
function groupCards(): { kind: string; title: string }[] {
  const root = document.querySelector("[data-testid='online-stakeholder-card']");
  if (!root) return [];
  return [...root.querySelectorAll("[data-testid='card-group']")].map((g) => ({
    kind: g.getAttribute("data-group") ?? "",
    title: g.querySelector("h3")?.textContent?.trim() ?? "",
  }));
}

describe("an online-only person's nickname sits under the family name", () => {
  it("group cards are Birthday, Family Name, Nickname, Given Name", async () => {
    draw();
    expect(await screen.findByTestId("online-stakeholder-card")).toBeTruthy();
    await screen.findByRole("heading", { name: "Nickname" });
    expect(groupCards()).toEqual([
      { kind: "theirs:a:birthday", title: "Birthday" },
      { kind: "theirs:a:familyName", title: "Family Name" },
      { kind: "theirs:a:nickname", title: "Nickname" },
      { kind: "theirs:a:givenName", title: "Given Name" },
    ]);
  });

  it("without a nickname the order is the kind's own order", async () => {
    theirNickname = null;
    stubPlatform({ ben: { given: "Ada", family: "Lovelace", email: null, nickname: null, birthday: "1980-03-14" } });
    draw();
    expect(await screen.findByTestId("online-stakeholder-card")).toBeTruthy();
    await screen.findByRole("heading", { name: "Given Name" });
    expect(screen.queryByRole("heading", { name: "Nickname" })).toBeNull();
    expect(groupCards()).toEqual([
      { kind: "theirs:a:birthday", title: "Birthday" },
      { kind: "theirs:a:familyName", title: "Family Name" },
      { kind: "theirs:a:givenName", title: "Given Name" },
    ]);
  });
});
