# skill-browse

A parent heading, a grouped list, and a ranked search over skills you already hold. Not a catalogue fetch.

## What this is

`skillParentLabel(skill)` returns the heading.

`searchSkills(skills, query, opts)` returns the ranked hits.

`groupSkillsByParent(skills, excludeUris)` returns groups.

Exclusion is the skill's `uri`, the storage address, compared exactly. It is not the type address. Excluding one does not exclude the other.

## What this is not

- Not the catalogue loader, and not the claim writer. Both stay in the app.
- Not the audience rung. Do not copy a rung list in here.
- Not a referent check. The function that refuses a storage address as a claim key stays in the app, because its pattern names a host.

## How to take it

Package: `@kaigilb/gilbplatformcode-skill-browse`

```ts
import { groupSkillsByParent, searchSkills, skillParentLabel } from "@kaigilb/gilbplatformcode-skill-browse";

const hits = searchSkills(catalogue, query, { excludeUris, minChars: 1, limit: 40 });
const groups = groupSkillsByParent(catalogue, excludeUris);
```

## What you pass

Each skill needs `tag` and `uri`. `does`, `parentLabel`, and `path` are optional.

`minChars` defaults to 1. `limit` defaults to 40. Both use `??`. `0` is kept. `0` is not "missing".

## What you get

The parent heading:

- Trimmed `parentLabel`, when it is non-empty.
- Otherwise the trimmed last path entry only. Earlier entries are not walked. A blank last entry does not fall through to an earlier one.
- Otherwise the exact word `Skills`.

That word is a real heading. A search for `skills` matches it. Do not special-case it.

The search:

- The needle is the query trimmed and lowered with `toLowerCase()`, not a locale.
- Tag equals the needle: 100. Tag starts with it: 80. Tag contains it: 60. Parent heading or path contains it: 45. Definition contains it: 20. Otherwise the skill is left out. The first of these that matches is the score. A tag match does not also add the definition score.
- Then add `max(0, 10 - min(lowered tag length, 40) / 4)`. The division is not rounded first. A shorter tag ranks ahead of a longer tag with the same base score.
- Sort by score descending, then `localeCompare` on the original tag, using the runtime's default locale.
- Cut to `limit` after the sort. The best scores survive, not the first rows scanned.
- Hits are the same objects, not copies. The input list is not reordered.

A limit of 0 returns nothing. A `minChars` of 0 lets an empty query through, and every tag starts with the empty needle, so you get the catalogue ranked by the length bonus. Do not switch `??` to `||`.

An empty query with the default `minChars` of 1 returns nothing.

Groups follow `localeCompare` on the heading. Skills inside a group follow `localeCompare` on the tag. Same object references.

## Examples

```ts
skillParentLabel({ tag: "A", uri: "a", path: ["Root", "Leaf"] }) === "Leaf";
skillParentLabel({ tag: "A", uri: "a", path: ["Work", ""] }) === "Skills";
searchSkills(skills, "") ; // []
searchSkills(skills, "bak", { limit: 0 }); // []
```

For the needle `bak`, `Baker` ranks ahead of `Baking`. Both start with `bak`. `Baker` is shorter, so its bonus is larger.

## The host must supply

The skills already loaded, and the set of storage uris to hide (usually the ones already claimed).

## Do not

- Do not exclude by the type address and expect the same rows.
- Do not slice before sorting.
- Do not treat the word `Skills` as "no parent, skip this row". It is searchable and it is a group heading.
- Do not mutate a hit if the catalogue must stay unchanged. The hit is the catalogue object.

## Wrong readings

- "Equal base scores keep catalogue order." Only when `localeCompare` also returns 0. Otherwise the tag order wins. A shorter tag usually wins before that, because of the bonus.
- "`limit: 0` means the default 40." It means no hits.
- "The last blank crumb should use the crumb before it." It does not.

## Where it was taken from

MyNetBase `src/lib/skills/thinSkills.ts`, `skillParentLabel`, `searchSkills`, and `groupSkillsByParent`. The loader and the referent check stay in the app.
