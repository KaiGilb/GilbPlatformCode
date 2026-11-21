// @vitest-environment node
// Spec: brief item 5 "see who has access" — every row of the list can be told from every other, from what the platform gives.
import type { AccessRow, AccessView } from "@kaigilb/gilbplatformcode-vault-share-sheet";
import { describe, expect, test } from "vitest";
import { keyEndings, tellApart } from "./accessList";

const P = "https://id.example.test/base/p/";
const label = (what: string, ending: string) => `${what}, key ending ${ending}`;
const row = (principal: string, over: Partial<AccessRow> = {}): AccessRow => ({ principal, label: "Registered principal", note: "An account is held.", level: "view", owner: false, named: false, ...over });

describe("keyEndings", () => {
  test("gives the last 6 characters of each key's last piece when those differ", () => {
    expect([...keyEndings([`${P}06gf80g4e5xhzfm96gsrtbh8g4`, `${P}06gf80rjtdw3h9q187p80kx00m`]).values()]).toEqual(["tbh8g4", "0kx00m"]);
  });

  test("takes more of the key, only as much as it needs, when 6 characters are the same", () => {
    const ends = keyEndings([`${P}aaa1-zzzzzz`, `${P}aaa2-zzzzzz`, `${P}bbbb-yyyyyy`]);
    expect([...ends.values()]).toEqual(["1-zzzzzz", "2-zzzzzz", "b-yyyyyy"]);
    expect(new Set(ends.values()).size).toBe(3);
  });

  test("a short key is shown whole, and a trailing slash is not its last piece", () => {
    expect([...keyEndings([`${P}k1`, `${P}k2/`]).values()]).toEqual(["k1", "k2"]);
  });

  test("two keys with the same last piece on two hosts are shown whole, so they still differ", () => {
    const keys = ["https://one.example.test/base/p/same", "https://two.example.test/base/p/same"];
    expect([...keyEndings(keys).values()]).toEqual(keys);
  });

  test("no key gives no ending", () => {
    expect(keyEndings([]).size).toBe(0);
  });
});

describe("tellApart", () => {
  const ben = row(`${P}06gf80g4e5xhzfm96gsrtbh8g4`);
  const cara = row(`${P}06gf80rjtdw3h9q187p80kx00m`, { label: "Principal key", level: "edit" });
  const dan = row("https://dan.example.test/base", { label: "dan", named: true, note: "Read from the vault's own host" });
  const owner = row(`${P}owner0000001`, { owner: true, level: "edit", note: null });

  test("a row the platform left unnamed gets the end of its key in its label; nothing else of the row changes", () => {
    const view = tellApart({ controlled: true, owner: null, rows: [ben, cara] }, label);
    if (!view.controlled) throw new Error("expected a controlled view");
    expect(view.rows.map((r) => r.label)).toEqual(["Registered principal, key ending tbh8g4", "Principal key, key ending 0kx00m"]);
    expect(view.rows.map((r) => ({ ...r, label: "" }))).toEqual([ben, cara].map((r) => ({ ...r, label: "" })));
  });

  test("a row the platform named is left exactly as it was, and takes no part in the endings", () => {
    const view = tellApart({ controlled: true, owner, rows: [dan, ben] }, label);
    if (!view.controlled) throw new Error("expected a controlled view");
    expect(view.rows[0]).toBe(dan);
    expect(view.rows[1]!.label).toBe("Registered principal, key ending tbh8g4");
    expect(view.owner!.label).toBe("Registered principal, key ending 000001"); // the sheet then shows the signed-in owner as "You"
  });

  test("two people with the same access and the same words never read alike", () => {
    const twin = row(`${P}06gf80g4e5xhzfm96gsrtbh8g5`);
    const view = tellApart({ controlled: true, owner: null, rows: [ben, twin] }, label);
    if (!view.controlled) throw new Error("expected a controlled view");
    expect(new Set(view.rows.map((r) => r.label)).size).toBe(2);
  });

  test("a view the person does not control is handed back as it is", () => {
    const view: AccessView = { controlled: false };
    expect(tellApart(view, label)).toBe(view);
  });
});
