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
  for (const unit of ["picture-pick", "vault-switcher", "record-picture", "signed-picture", "zip", "csp-headers", "browser-proof", "vault-export"]) {
    const file = join(ROOT, "units", unit, "unit.json");
    assert.ok(existsSync(file), `${unit} has a unit.json`);
    const lib = JSON.parse(readFileSync(file, "utf8")).library;
    assert.equal(lib.note, library[unit].note, unit);
    assert.equal(lib.title, library[unit].title, unit);
  }
});
