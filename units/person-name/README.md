# person-name

Orders and splits a person's name fields, as the person card lays them out.

## What this is

Orders and splits a person's name fields, as the person card lays them out.

Four pure functions. They read nothing and write nothing.

- `splitPersonName(name)` splits a whole name into `{ given, family }`. It trims the name and turns every run of white space into one space. The first word is the given name and the rest is the family name. One word is a given name only. An empty, blank, `null` or `undefined` name gives two empty strings. "Anna Maria Berg" is "Anna" and "Maria Berg", the way MyNet splits a name.
- `personCardOrder(fields, givenSlug, familySlug, hidden, nicknameSlug?)` returns the fields in the order the card shows them: the given-name field, the family-name field, the nickname field when `nicknameSlug` names one of the fields, then every other field in its own order. The slugs in `hidden` (the record's one-name box, the photo box) are left out; `null` and `undefined` entries in `hidden` are ignored. A given, family or nickname slug that no field has is skipped. It returns the same field objects, in a new array.
- `personSectionOrder(ordered, sections, nicknameSlug?)` takes the list from `personCardOrder`, keeps its first two fields (three when `nicknameSlug` is passed), puts the sections after them in the order given, then the other fields. A field that a section stands for is not shown a second time.
- `personCardFields(ordered, mynetSections, late)` is the whole card order: `personSectionOrder(ordered, mynetSections)`, then each section in `late` whose slug is not one of the `ordered` fields. A late section whose field is among the fields is not moved up: it stays where its field sits. One whose field is not among them follows them, and is never dropped.

A field is anything with a string `slug`. The functions are generic over it and give back your own objects.

## What this is not

- Not a lookup of which field is the given name. You pass the two slugs. Find them by the type's terms (`givenName`, `familyName`), never by a spelling of your own.
- Not `joinPersonName` (given + space + family). That one lives in `plan-self-source` and nothing here calls it.
- Not a writer. The record keeps its one name in step with the two boxes in your code; this unit only orders and splits.

## How to take it

Package: `@kaigilb/gilbplatformcode-person-name`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/person-name
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. It has no peers and no third-party dependency.

## Examples

```ts
import { personCardFields, personCardOrder, splitPersonName } from "@kaigilb/gilbplatformcode-person-name";

splitPersonName("Anna Maria  Berg"); // { given: "Anna", family: "Maria Berg" }

const fields = ["contactLanguage", "email", "fam", "giv", "name", "phone"].map((slug) => ({ slug }));
personCardOrder(fields, "giv", "fam", ["name"]).map((f) => f.slug);
// ["giv", "fam", "contactLanguage", "email", "phone"]

const ordered = personCardOrder(fields, "giv", "fam", ["name"]);
personCardFields(ordered, [{ slug: "email" }, { slug: "phone" }], [{ slug: "contactLanguage" }]).map((f) => f.slug);
// ["giv", "fam", "email", "phone", "contactLanguage"]  (the late section's field was among the fields, so it sits where it sat)
```

## What the host must supply

Nothing.

## Module state

None. Every function is pure.

## Do not

- Do not pass a nickname slug to `personSectionOrder` unless the list you pass was built with the same nickname slug by `personCardOrder`. The lead of three assumes the nickname is third.
- Do not use it to write the person's name. It orders and splits; it does not join.
- Do not depend on `personCardFields` taking a nickname: it has no nickname parameter (it calls `personSectionOrder` with the lead of two, as the source does).

## Wrong readings

- "A one-word name is a family name." It is a given name only.
- "`personCardOrder` drops a field it cannot find." It drops only the slugs in `hidden` and the three it places in front; a slug it does not find is skipped and the rest are untouched.
- "`personCardFields` sorts the late sections to the end." A late section whose field is among the fields stays where that field is; only one with no field is put last.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/base/personName.ts` lines 14 to 21 (`splitPersonName`) and 28 to 81 (`personCardOrder`, `personSectionOrder`, `personCardFields`) to `src/personName.ts`.

`joinPersonName` (lines 23 to 26 of the source) is not taken: it is in `plan-self-source` (the comment-stripped declarations are equal, 12 tokens each), and none of the four functions here calls it. Imports of the kept range: none. Named changes, and only this: the file's header comment and two doc comments that name a cycle, an iteration or a ticket are reworded; no code changed. `src/index.ts` is new. The comment-stripped declarations of all four functions are equal to the source's (0 diff lines).

## Tests

40 tests in 3 files (`npx vitest run`):

- `personName.test.ts` 25: 4 ported from the source's `personName.c214e1.test.ts` (split a one-name record; order given, family, rest; the nickname slug; the sections after the leading names) and 21 new (empty and blank names, white space, a missing given or family field, `hidden` with `null` and `undefined`, a hidden slug no field has, a missing, null or empty nickname, a nickname also hidden, object identity and no change to the input, sections in the order given, an empty nickname slug, the three `personCardFields` cases of its doc comment).
- `exports.test.ts` 2 (exactly the four functions, their arities).
- `hostAgnostic.test.ts` 13.

Left out of the source's 8 cases: `builds the name from the two boxes` (tests `joinPersonName`, which `plan-self-source` owns), and the three `fields are found by their ontology term` cases (they test `termName` and `fieldOfTerm`, which `stakeholder-card-model` owns).
