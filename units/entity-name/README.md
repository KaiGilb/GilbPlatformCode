# entity-name

The name a row shows, the slug a name box binds to, and the label a write copies. They are three questions. They do not give the same answer.

## What this is

`entityDisplayName(facts, opts)` is the text on a row, a card, or a search hit.

`openTypeNameSlug(facts)` is `"label"` or `"title"`. That is the fact the name box reads and writes when the type has no field spec of its own.

`withCanonicalLabel(facts, nameField)` returns the fact map a write should send, with `label` filled from the name when the name lives somewhere else.

## What this is not

- Not one function with three names. Using the row's answer as the box's slug, or running the write helper on a record you just opened, is how a tag lands in the name box or a second title appears.
- Not `display-friendly`. Shortening an email or an address is a private copy of that unit, used for identity values and for the entity uri. It is not applied to `label`, `unitTag`, or a bridge. The public function stays in `display-friendly`. The copy must stay in agreement with that unit's default (`hostPaths` is `["base"]` only). A path `/vault` still shortens to the word `vault`, not the host.
- Not `doc-label`. That unit reads a document's own stated name and returns blank when there is none. This unit has a fallback word, `Untitled`, unless you pass a fallback.
- Not a migration. Nothing here deletes `title` or decides that every type has stopped using it.

## How to take it

Package: `@kaigilb/gilbplatformcode-entity-name`

```ts
import {
  entityDisplayName,
  openTypeNameSlug,
  withCanonicalLabel,
} from "@kaigilb/gilbplatformcode-entity-name";

const rowText = entityDisplayName(facts, { nameField, entityUri });
const boxSlug = openTypeNameSlug(facts);
const toWrite = withCanonicalLabel(draft, nameField);
```

Facts use the bare slug (`label`), not `a:label`.

## What you pass

`facts` — the record's facts. Missing, null, and a non-string are skipped. Strings are trimmed for the comparison. The stored value you get back for a row is the trimmed text.

`nameField` — the type's own name slug, when it has one. `null`, `""`, and omitted mean "no extra name field."

`fallback` — the row's last resort. Omit it for `Untitled`. `""` stays `""`. It is not replaced.

`entityUri` — used only when no fact above it produced text. It is trimmed, then shortened.

`withCanonicalLabel` takes a map whose values are strings, and an optional name field. It does not take the box slug. Do not pass `openTypeNameSlug(...)` as the name field and expect the tag-copy rule to run again. The write helper has its own order.

## What you get

### The row

This order. The first non-blank wins.

1. `label`. Not shortened. A label that is an address is shown whole.
2. `unitTag`, then `tag`.
3. Identity, shortened: `anchorBoundEmail`, `accountSubject`, `principalUri`, `aliasUri`, `registeredVault`, `vaultAddress`.
4. `nameField`, if you passed one and it is not already in 1–3.
5. Bridges: `title`, then `processName`, then `name`. If `nameField` is one of those, it is not read twice.
6. The entity uri, shortened.
7. The fallback.

`ruleId` is not a row fallback. A record with only `ruleId` shows `Untitled`, unless `nameField` is `"ruleId"`.

A tag beats a bridge on the row. `{ unitTag: "T", processName: "P" }` shows `T`, even when `nameField` is `processName`.

### The box

- Any non-blank `title` → `"title"`. This wins over `label`. Both `Cat` / `Cat` and `PROC_01` / `Assign the reviewer` bind to `title`.
- No title and no label → `"label"`.
- No title, and the trimmed label equals any of `unitTag`, `unit-tag`, `ruleId`, `rule-id`, `tag` → `"title"`. The box is bound to a fact that is not there, so the box is empty. It must not show the tag.
- Otherwise → `"label"`.

Equality is exact after trim. Label `Cat` against tag `type-cat` is `"label"`. Label `proc_01` against tag `PROC_01` is `"label"`.

The row does not follow this rule. Label `PROC_01` with `unitTag` `PROC_01` shows `PROC_01` on the row and binds the box to `title`. That split is the point. The row is allowed to show the tag. The box is not.

A cleared tag is an open hole. If the label was copied from a tag and the tag was then removed, nothing is left to compare, so the box returns `"label"` and shows the stale text. Do not close that hole here.

### The write

When nothing would change, you get the same object back. You can use `===`.

- If the name field (or `label`, when you did not pass a different name field) has text, that text is written to `label` and to `title` wherever they differ. Tags are not looked at. Then it stops.
- Else if `label` has text, `title` is set to it when they differ. This runs even when that label is a tag. This helper does not apply the box's tag-copy rule.
- Else the first bridge with text (`title`, `processName`, `name`) is copied to both `label` and `title`. A bridge beats a tag on the write. `{ unitTag: "T", processName: "P" }` writes label `P` and title `P`. The row would have shown `T`.
- Else the first of `unitTag`, `tag` is copied to `label` only. `title` is not added.
- Else the first identity value is shortened and copied to `label` only.
- Else the same object.

`withCanonicalLabel({ unitTag: "Proc" }, "title")` returns `{ unitTag: "Proc", label: "Proc" }` and does not add `title`. The name field `title` was empty, so the tag branch ran, and that branch does not set `title`.

## Examples

```ts
entityDisplayName({ label: "Cat", unitTag: "type-cat" }); // "Cat"
entityDisplayName({ unitTag: "T", processName: "P" });    // "T"
entityDisplayName({ ruleId: "RULE-7" });                  // "Untitled"

openTypeNameSlug({ label: "Cat" });                       // "label"
openTypeNameSlug({ label: "PROC_01", unitTag: "PROC_01" }); // "title"
openTypeNameSlug({ label: "Cat", title: "Cat" });         // "title"

withCanonicalLabel({ title: "New note" }, "title");
// { title: "New note", label: "New note" }

withCanonicalLabel({ unitTag: "T", processName: "P" });
// label and title become "P". The row would still say "T" until that write lands.
```

## The host must supply

The facts, the type's `nameField` if the type has one, and the entity uri when the facts are only markers. This unit does not read a record and does not know which types have a spec.

## Do not

- Do not call `withCanonicalLabel` on the facts you just loaded so the name box fills in. That was the obvious fix for an old title, and it left two name facts. Fill the box with `openTypeNameSlug`. Write with `withCanonicalLabel` only when the person saves.
- Do not sort the three slug lists into one order. The row, the box, and the write disagree on purpose.
- Do not shorten `label` the way identity addresses are shortened.
- Do not treat `ruleId` as a name for the row. It is only a spelling the box compares against.
- Do not change the private shortener without changing `display-friendly`. A `/base` address becomes the host. A `/vault` address becomes the word `vault`.

## Wrong readings

- "The box and the row show the same string." Not when the label is a copy of a tag. The row shows it. The box is empty.
- "The write prefers the tag, like the row." No. On a write with no label, a bridge wins and a tag is second.
- "`Untitled` means the record has no facts." No. It means none of the name facts above had text. Pass `fallback: ""` if a blank row is what you need. Do not test for the word.
- "Same object back means the name was empty." No. It means nothing needed copying. A record that already has `label` and `title` equal to the source comes back as itself.

## Where it was taken from

GilbApp `src/lib/base/entityDisplayName.ts`: `entityDisplayName`, `openTypeNameSlug`, `withCanonicalLabel`, and the slug lists. The shortener matches `units/display-friendly` at its default, which is the app's rule. The record save stays in the app.
