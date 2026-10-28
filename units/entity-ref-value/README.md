# entity-ref-value

Shows a stored reference to another record as that record's name, a button that opens it, with the stored address on a quiet second line.

## What this is

- `EntityRefValue({ value, vaultId, onOpen?, quiet? })`: `value` is the stored string. If it is a record address (`http(s)://<host>/<base-or-vault>/e/<id>`), it draws the record's name: a `<button type="button">` that calls `onOpen(id)` when `onOpen` is given, a plain `<span>` when it is not. The name carries `title={value}`. Under it, the stored address, small and faint, also titled with the value, unless `quiet` is set (the card look: the name alone). While the host's hook says it has no name yet (`null`), the name is shown as `…`. If `value` is not a record address, it is drawn as it is, in a `<span class="break-words">`.
- `isEntityRefValue(value)`: true when `value` is a record address (the same test the component makes, from the `entity-ref` unit's `entityRefFromFact`: surrounding spaces are fine, a query or hash or a path after the id is ignored, a type address `/t/`, a relation address `/r/` and a bare word are not).
- `RefLabelContext` and `UseRefLabel`: how the host gives the component the hook that finds the name: `(ref: { id: string; uri: string } | null, vaultId: string) => string | null`. `null` means still loading. The hook is called on every render, with `null` for a value that is not a record address.
- `refDisplayName(facts, entityUri?)`: the name to show for a record, so that a host can build its hook the way the source app does. In this order, each after trimming and skipping a blank: `label`, `termLabel`, `title`, `name`; then `unitTag`, then `tag`; then `fileName`; then the legible tail of `entityUri` (query and hash removed, trailing slash removed, percent-encoding decoded); then `Untitled`.

## What this is not

- Not a reader of records. It never fetches; the host's hook does, and says only a string or `null`.
- Not the list of records that point at a record (`RelatedChildren` of the source): that needs a host query of its own and is not in this unit.
- Not the `entity-ref` unit's `refDisplayName`: see "Wrong readings".
- Not a check that the record exists. A failed read is named by the address; the button still opens it.

## How to take it

Package: `@kaigilb/gilbplatformcode-entity-ref-value`

Take it together with its peers `entity-ref` and `id-tail`. Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

```tsx
import { useQuery } from "@tanstack/react-query";
import { EntityRefValue, RefLabelContext, refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";

// Once, above every EntityRefValue. useRecords, readRecord and originOf are yours:
//   useRecords(vaultId): { data?: { id: string; entityUri?: string; facts: Record<string, string> }[] }  (the records already loaded)
//   readRecord(id, uri): Promise<{ facts: Record<string, string>; entityUri?: string }>
//   originOf(uri | null): string  (the origin the record is served from, part of the cache key)
const useRefLabel: UseRefLabel = (ref, vaultId) => {
  const list = useRecords(vaultId);
  const fromList = ref ? (list.data ?? []).find((r) => r.id === ref.id || r.entityUri === ref.uri) : undefined;
  const cached = fromList ? refDisplayName(fromList.facts, fromList.entityUri) : null;

  const q = useQuery({
    queryKey: ["base", "record", ref?.id ?? "", originOf(ref?.uri ?? null)],
    queryFn: () => readRecord(ref!.id, ref!.uri),
    enabled: !!ref && !cached,
    staleTime: 30_000,
  });

  if (cached) return cached;
  if (q.isPending) return null;
  if (q.data) return refDisplayName(q.data.facts, q.data.entityUri || ref?.uri);
  return ref ? refDisplayName(null, ref.uri) : null;
};

<RefLabelContext.Provider value={useRefLabel}>
  <App />
</RefLabelContext.Provider>;

// Anywhere below it.
<EntityRefValue value="https://example.test/base/e/ann" vaultId="https://example.test/vault" onOpen={(id) => openRecord(id)} quiet />;
```

The rules of that hook are the source's: a hit in the loaded list wins, even while the read is pending (the read is switched off when there is a hit); the read is kept for 30 000 ms; pending is `null` (shown as `…`); a read that succeeds is named by `refDisplayName(facts, its own address || the link's address)`; a read that fails is named by the link's own address (`refDisplayName(null, uri)`), not `Untitled`. The source passed no `retry` option to its query call, so the host's own default retry applies before a failure shows.

## What the host must supply

- The `RefLabelContext` provider, above every `EntityRefValue`, with a hook of the type `UseRefLabel`. With none, `EntityRefValue` throws an error naming the provider, also for a value that is not a record address.
- Tailwind scanning this unit's `src`, so its classes are generated (`text-[14px]`, `text-[11px]`, `truncate`, `min-w-0`, `gap-0.5`, `break-words`, `hover:text-[var(--accent)]`).
- These CSS variables: `--ink`, `--accent`, `--ink-ghost`.
- React 19, and the `entity-ref` and `id-tail` units installed beside this one.

## Do not

- Do not list `entity-ref` or `id-tail` under this unit's `dependencies` or give the app a second copy of either; keep one copy of each.
- Do not install a second copy of this unit: a second copy has its own context, and a value below a provider from the other copy throws.
- Do not return `"Untitled"` from your hook to mean "still loading": return `null`. `Untitled` is a name.
- Do not write the shown name back onto the record; the stored value is the address.

## Wrong readings

- "`refDisplayName` here is the one in `entity-ref`." It is not. This one also reads `unitTag` and `tag` (after the four names) and `fileName`, and falls back to the tail of the address with `id-tail`'s `opaqueIdFromUri`; the `entity-ref` one reads only `label`, `termLabel`, `title`, `name`, so a record named by `unitTag` is `Untitled` there and its tag here.
- "`quiet` hides the title." It hides only the address line; the name still has `title={value}`.
- "A hit in the list is read again." No: with a hit in the list, the read is not made.
- "A failed read shows `Untitled`." It shows the tail of the link's address.
- "`onOpen` receives the address." It receives the id decoded from it.
- "A value with a query or a trailing path is not a reference." It is: the id is taken and the rest is dropped from the rebuilt address, but the title and the second line show the stored value as it was.
- "The name is drawn before the hook answers." While the hook returns `null` it is `…`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/EntityRefValue.tsx` lines 40-83 (`EntityRefValue`, `isEntityRefValue`) and the first two comment lines to `src/EntityRefValue.tsx`. `useResolvedRefLabel` (lines 16-38) and `RelatedChildren` (lines 85-157) are not taken. Named changes: `useResolvedRefLabel(parsed, vaultId)` is `useRefLabel(parsed, vaultId)`, the hook read from the new `RefLabelContext` (`useContext`) and called in the same place; with no provider it throws. `UseRefLabel` and `RefLabelContext` are new exports. `entityRefFromFact` is imported from `@kaigilb/gilbplatformcode-entity-ref`. Comments made generic.
- `src/lib/base/entityRefFacts.ts` lines 61-83 (`refDisplayName`) to `src/refDisplayName.ts`. Code verbatim; `MASTER_TAG_SLUGS` (`["unitTag", "tag"]`, from `src/lib/base/entityDisplayName.ts` line 28) is a non-exported constant beside it; `opaqueIdFromUri` is imported from `@kaigilb/gilbplatformcode-id-tail`. Comments made generic.
- Compared with the peers, comments stripped: `entityRefFromFact` in `src/lib/base/entityRefFacts.ts` (lines 36-46) and in the `entity-ref` unit have the same regular expression, the same decode and the same result (the unit adds only guards against an undefined array element); `opaqueIdFromUri` in `src/lib/base/relations.ts` (lines 149-162, which is `uriTail`) and in the `id-tail` unit are the same function (the unit's `uriTail` adds only `?.` and `?? ""` guards on the first split element, which always exists).

`src/index.ts` is new.

Tests:

| Source | Ported / left out |
|---|---|
| `src/lib/base/entityRefFacts.test.ts`, `describe("refDisplayName")` (2 cases), and the `refDisplayName` expectation of `describe("childrenPointingAt + refDisplayName")` | Ported to `src/refDisplayName.test.ts` (the second as its own case; hosts are example.test). |
| The other cases of that file (`entityRefFromFact`, `findEntityRefPairs`, `missingEntityRefTargets`, `childrenPointingAt`) | Left out: they test functions that are not in this unit (they are in `entity-ref`). |
| `src/components/records/RelatedChildren.disclosure.test.tsx` | Left out: it renders `RelatedChildren`. |
| `src/lib/base/credentialHost.d10.test.ts` | Left out: it tests the record read, not this component. |

The source had no test that renders `EntityRefValue` alone. `src/EntityRefValue.test.tsx` is new (the name, the button, the title, `quiet`, `…`, the plain text, `isEntityRefValue`, the missing provider). `src/refLabelHook.test.tsx` runs the hook of the example above against a fake list and a fake read, with `@tanstack/react-query` as a dev dependency of the tests only. `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
