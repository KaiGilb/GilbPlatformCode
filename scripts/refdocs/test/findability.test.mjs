import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The public search matches every word of the query, case-insensitively, as a substring of a unit's title + note.
// These are the searches an app-building AI tried in run 8 and found nothing for; each must now reach its unit.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const library = JSON.parse(readFileSync(join(ROOT, "scripts", "refdocs", "library.json"), "utf8"));

const found = (unit, phrase) => {
  const d = library[unit];
  assert.ok(d, `${unit} is in library.json`);
  const hay = `${d.title} ${d.note}`.toLowerCase();
  return phrase.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};

const CASES = [
  ["create vault first sign-in", ["signin"]],
  ["take photo camera", ["picture-pick"]],
  ["vault chooser", ["vault-switcher", "vault-list"]],
  ["record picture", ["record-picture"]],
  // CB2
  ["picture bytes", ["signed-picture"]],
  ["download the original picture", ["signed-picture"]],
  ["read a picture's bytes", ["signed-picture"]],
  ["picture service per vault", ["record-picture"]],
  ["release picture URLs", ["record-picture"]],
  // CB3
  ["make a zip", ["zip"]],
  ["zip file", ["zip"]],
  ["pack files into an archive", ["zip"]],
  ["export as zip", ["zip"]],
  ["content security policy", ["csp-headers"]],
  ["CSP header", ["csp-headers"]],
  ["_headers file", ["csp-headers"]],
  ["Cloudflare headers", ["csp-headers"]],
  ["meta CSP", ["csp-headers"]],
  // CB4
  ["browser test", ["browser-proof"]],
  ["end-to-end test", ["browser-proof"]],
  ["headless Chrome", ["browser-proof"]],
  ["e2e harness", ["browser-proof"]],
  ["take screenshots in a test", ["browser-proof"]],
  ["export records", ["vault-export"]],
  ["export as zip", ["vault-export"]],
  ["download my data", ["vault-export"]],
  ["back up a vault", ["vault-export"]],
  ["remember the chosen vault", ["vault-list"]],
  ["shared with you banner", ["vault-list"]],
  // CB6
  ["start-up", ["signin"]],
  ["start up", ["signin"]],
  ["sign in", ["signin"]],
  ["sign-in", ["signin"]],
  ["open app vault", ["signin"]],
  ["first sign-in creates vault", ["signin"]],
  ["since last visit", ["since-last-visit"]],
  ["since your last visit", ["since-last-visit"]],
  ["what changed", ["since-last-visit"]],
  ["new records", ["since-last-visit"]],
  ["activity banner", ["since-last-visit"]],
  ["header menu", ["menu-place"]],
  ["three dots", ["menu-place"]],
  ["menu more", ["menu-place"]],
  ["overflow menu", ["menu-place"]],
  // CB5
  ["record list", ["optimistic-records"]],
  ["add edit delete", ["optimistic-records"]],
  ["undo delete", ["optimistic-records"]],
  ["optimistic", ["optimistic-records"]],
  ["offline-friendly", ["optimistic-records"]],
  ["switch vault", ["vault-switcher"]],
  ["choose vault", ["vault-switcher"]],
  ["several vaults", ["vault-switcher"]],
  ["shared with me", ["vault-switcher"]],
  ["vault picker", ["vault-switcher"]],
  ["error message", ["refusal-detail"]],
  ["describe an error", ["refusal-detail"]],
  ["flow deps for a vault", ["record-picture"]],
  ["stamp who stated a record", ["record-picture"]],
  // Round 9 CB3
  ["share", ["vault-share-sheet"]],
  ["give access", ["vault-share-sheet"]],
  ["invite", ["vault-share-sheet"]],
  ["who has access", ["vault-share-sheet"]],
  ["owner", ["vault-share-sheet"]],
];

for (const [phrase, units] of CASES) {
  for (const unit of units) {
    test(`searching "${phrase}" reaches ${unit}`, () => {
      assert.ok(found(unit, phrase), `every word of "${phrase}" is in the title or note of ${unit}`);
    });
  }
}

test("a unit's own unit.json library note is identical to its library.json note", () => {
  for (const unit of ["picture-pick", "vault-switcher", "record-picture", "signed-picture", "zip", "csp-headers", "browser-proof", "vault-export", "since-last-visit", "optimistic-records", "refusal-detail"]) {
    const file = join(ROOT, "units", unit, "unit.json");
    assert.ok(existsSync(file), `${unit} has a unit.json`);
    const lib = JSON.parse(readFileSync(file, "utf8")).library;
    assert.equal(lib.note, library[unit].note, unit);
    assert.equal(lib.title, library[unit].title, unit);
  }
});
