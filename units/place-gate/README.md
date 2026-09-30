# place-gate

Which place fields a viewer may see, and why a migration must not run.

## What this is

`placeFieldsVisibleTo(fields, viewerRungs, isNameableTier)` returns the fields this viewer may render.

`migrationRefusalReason({ rawTier, hasLegacyFields, alreadyDecomposed })` returns why a stored place must not be split into field claims, or `null` when it may.

## What this is not

- Not the audience list. `isNameableTier` is yours. The closed set of rungs stays in the app. Do not copy it here.
- Not a fetch, and not a writer. A `null` refusal means "may run". It does not run it.
- Not a sentence for the screen. You get a short reason code. The screen's words stay in the app.
- Not a comparison of the saved street against what was written. That is `units/place-kept`.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-gate`

```ts
import { migrationRefusalReason, placeFieldsVisibleTo } from "@kaigilb/gilbplatformcode-place-gate";

const visible = placeFieldsVisibleTo(fields, viewerRungs, isNameableTier);
const refusal = migrationRefusalReason({ rawTier, hasLegacyFields, alreadyDecomposed });
if (refusal) tellThePerson(refusal);
```

## What you pass

Each field has `tier`, the stored audience string. It is not trimmed.

`viewerRungs` is the set of tier strings this viewer is admitted to. An empty list is a real viewer who may see nothing. It is not "show all".

`isNameableTier` returns true only for a tier this build can name. The app's own check is exact membership of its rung list.

`rawTier` is the stored rung of the composite place. `hasLegacyFields` is whether the old street or place facts are still there. `alreadyDecomposed` is whether the field claims already exist.

## What you get

A field is kept only when `isNameableTier(tier)` is true and `tier` is in `viewerRungs` by exact match. No trim. `" public"` does not match `"public"`.

A tier the host cannot name is dropped even when that same text is in `viewerRungs`.

Order is kept. The objects are the same objects.

Do not draw an empty slot for a dropped field. Do not draw a "hidden" chip. Both say something untrue. Render what came back and say nothing about the rest.

`migrationRefusalReason` checks in this order. Do not reorder it.

1. `alreadyDecomposed` → `"already-decomposed"`, even when the tier is blank and there are no legacy fields.
2. `hasLegacyFields` is false → `"nothing-to-migrate"`, even when the tier is blank.
3. `rawTier` is empty after trim → `"unreadable-rung"`. Spaces only count as empty. `"  public  "` is not empty.
4. Otherwise `null`.

The accepted tier is not returned. You still have `rawTier`. Do not replace a blank rung with a default. Refusing is the point.

## Do not

- Do not call this with a rung test that always returns true. An unnameable tier would then be shown whenever it is in the viewer list.
- Do not treat an empty viewer list as "not loaded yet". If you have not loaded, do not call this. An empty list means nobody is admitted.
- Do not migrate when the reason is non-null.

## Wrong readings

- "A dropped city means the person has no city." No. It means this viewer is not shown one. The field may exist.
- "Blank rung, already decomposed, so the reason is unreadable-rung." No. Already decomposed wins, and it wins first.
- "`null` means the migration ran." No. It means this gate does not refuse it.

## Where it came from

MyNetBase `src/lib/base/placeFieldClaim.ts` — `placeFieldsVisibleTo`, `migrationRefusalReason`. The rung test was inside the app. It is an argument here. The write stayed in the app.
