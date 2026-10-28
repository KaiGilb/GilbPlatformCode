# project-levels

Builds the tree of a project's levels (Business, Product, Solution and any the project added) for a level chooser, and gives a card the one hook that reads them and adds a level, with the host doing every read and write.

## What this is

Builds the tree of a project's levels (Business, Product, Solution and any the project added) for a level chooser, and gives a card the one hook that reads them and adds a level, with the host doing every read and write.

A project's levels are `CauseEffectLevel` records in its vault. A record's `a:level` stays the token: the level's tag without the leading `Level.`. This unit holds the rules over those records and the hook a card calls.

- Constants: `NOT_A_PROJECT_LEVEL` (the sentence for a level that is not one of the project's), `ADD_LEVEL` (the select value that opens the add-level form; never stored), `DEFAULT_LEVELS` (the four defaults `Business`, `Stakeholder`, `Product`, `Solution`, with label, position and `ontologyTerm`).
- `DEFAULT_LEVELS[i].ontologyTerm` is a getter: it returns `<term origin>/base/t/BusinessLevel` (or `StakeholderLevel`, `ProductLevel`, `SolutionLevel`), the origin being the one set once with `setTermOrigin` of the `term-origin` unit, read at the moment the property is read. Before `setTermOrigin` has been called, reading it throws (that unit's error). Reading `token`, `label` or `position` never needs the origin. A copy made with `{ ...d }` holds the string as it was then.
- Tokens and tags: `tokenOf("Level.Product.Sub")` is `Product.Sub`; `tagOf("Product.Sub")` is `Level.Product.Sub` (empty for nothing); `pascalCase("Sub Product")` is `SubProduct` (words split on anything outside A-Z, a-z, 0-9, so an accented letter splits a word); `isDefaultLevelToken`; `levelKnown(token, tree)` (an empty token is "unset" and known; a tree member or a default is known); `isCauseEffectLevel(record)`; `levelTag(node)` (the record's own tag, else the tag of the token).
- The tree: `levelTree(records)` makes the depth-first list of `LevelNode` (`token`, `label`, `depth`, `record`) from the level records: siblings by `a:levelPosition`, then label, then token; a missing position sorts last; a record whose parent (`a:partOf`, as a bare id, an address, an `{"@id"}` object, a list or JSON text) is not in the list is a root; a self-parent is a root; a cycle is walked once and does not hang. `defaultLevelTree()` is the four defaults at depth 0 with no record.
- The chooser: `pickerNodes(tree, stored)` (the tree, with a stored default that the tree lacks put in front; an unknown stored token is not offered), `optionLabel(node)` (the label indented two non-breaking spaces a level, then ` · token` when the token differs from the label).
- Positions: `directChildren(tree, parentToken)` and `nextPosition(tree, parentToken)` (one past the highest position among the siblings; 1 when there is none), for a host that writes a new level.
- `useProjectLevels(vaultId)`: returns `{ tree, hasStored, ensure, add }`. `tree` is the stored tree when the vault has at least one level record and the read succeeded, else the four defaults; `hasStored` says which. `ensure()` and `add(label, parentToken)` write through the host, and only when called: reading never writes. Both throw the level query's own `Error` when its read failed (any other failure becomes "Could not read every level of this vault."), and wait for the first read to finish when it has not yet.
- `ProjectLevelsHostContext`, `ProjectLevelsHost`, `AllLevelsResult`: how the host gives the hook its four calls.

## What this is not

- Not a store: it reads and writes nothing. The level query, the wait, the defaults and the new level are the host's.
- Not the chooser itself: it gives the nodes and their labels; the select is the card's.
- Not a tag rule for anything but levels: `tagOf` and `tokenOf` handle the `Level.` prefix only.
- Not a type registry: `isCauseEffectLevel` asks `isTypeName` of the `type-key` unit.

## How to take it

Package: `@kaigilb/gilbplatformcode-project-levels`

Take it together with its four peers: `base-record`, `plan-card-facts`, `term-origin` and `type-key` (none of them has a peer unit of its own). Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one term origin and one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/base-record <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-key <path-to-the-library>/units/project-levels
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

A host kept in memory, and a chooser; the same code runs in `src/example.test.tsx`.

```tsx
import { useEffect, useState } from "react";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import {
  ADD_LEVEL, DEFAULT_LEVELS, ProjectLevelsHostContext, levelTag, levelTree, nextPosition, optionLabel,
  pascalCase, pickerNodes, tagOf, tokenOf, useProjectLevels,
} from "@kaigilb/gilbplatformcode-project-levels";
import type { AllLevelsResult, ProjectLevelsHost } from "@kaigilb/gilbplatformcode-project-levels";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

// Once, at start-up, before any default level is written.
setTermOrigin("https://terms.example.test");

const stored: GridRecord[] = []; // the host's own store of the vault's level records
const writes: string[] = [];

function levelRecord(vaultId: string, tag: string, label: string, position: number, extra: Record<string, unknown>): GridRecord {
  const id = `level-${tokenOf(tag)}`;
  return {
    id,
    entityUri: `${vaultId}/e/${id}`,
    typeUri: "t:CauseEffectLevel",
    facts: { unitTag: tag, label, levelPosition: String(position) },
    opaqueFacts: [],
    etag: null,
    updatedAt: 0,
    served: { facts: { unitTag: tag, label, levelPosition: position, ...extra }, context: undefined, etag: null },
  };
}

const host: ProjectLevelsHost = {
  useAllLevels(vaultId) {
    const [state, setState] = useState<AllLevelsResult>({ isSuccess: false, isError: false, error: null });
    useEffect(() => {
      if (!vaultId) return;
      setState({ data: [...stored], isSuccess: true, isError: false, error: null }); // a real host reads the vault here
    }, [vaultId]);
    return state;
  },
  async waitForLevels() {},
  async ensureDefaultLevels(vaultId) {
    if (stored.length === 0) {
      for (const d of DEFAULT_LEVELS) {
        writes.push(`default ${d.token}`);
        stored.push(levelRecord(vaultId, tagOf(d.token), d.label, d.position, { ontologyTerm: d.ontologyTerm }));
      }
    }
    return [...stored];
  },
  async addProjectLevel(vaultId, label, parentToken) {
    const pascal = pascalCase(label.trim());
    if (!pascal) throw new Error("A level needs a label.");
    await host.ensureDefaultLevels(vaultId);
    const tree = levelTree(stored);
    const parent = parentToken ? tree.find((n) => n.token === parentToken) ?? null : null;
    const tag = parent ? `${levelTag(parent)}.${pascal}` : tagOf(pascal);
    const extra: Record<string, unknown> = { ontologyTerm: "none" };
    if (parent?.record?.entityUri) extra.partOf = { "@id": parent.record.entityUri };
    writes.push(`add ${tag}`);
    stored.push(levelRecord(vaultId, tag, label.trim(), nextPosition(tree, parent ? parent.token : null), extra));
    return tokenOf(tag);
  },
};

function LevelChooser({ vaultId, current }: { vaultId: string; current: string }) {
  const { tree, hasStored, ensure, add } = useProjectLevels(vaultId);
  const [added, setAdded] = useState("");
  return (
    <div>
      <select defaultValue={current}>
        {pickerNodes(tree, current).map((n) => (
          <option key={n.token} value={n.token}>{optionLabel(n)}</option>
        ))}
        <option value={ADD_LEVEL}>Add a level</option>
      </select>
      <button onClick={() => void ensure()}>Set</button>
      <button onClick={() => void add("Sub Product", "Product").then(setAdded)}>Add</button>
      <p data-testid="state">{hasStored ? "stored" : "defaults"} {added}</p>
    </div>
  );
}

// Once, above every chooser.
<ProjectLevelsHostContext.Provider value={host}>
  <LevelChooser vaultId="https://plan.example.test/vault" current="Product" />
</ProjectLevelsHostContext.Provider>;
```

## What the host must supply

The `ProjectLevelsHostContext` provider, above every card that calls `useProjectLevels`. With none, the hook throws an error that names it. The host has four members, each the call the source made, with the same arguments; the source's `qc` (its query client) is not passed, because the host holds it:

- `useAllLevels(vaultId): { data?, isSuccess, isError, error }` is a hook, called first on every render and never conditionally. GilbApp: `useAllLevels(vaultId)`, `planLevels.ts` lines 294-302 (a `useQuery` of the vault's level records, enabled when `vaultId` is not empty, not retried). `data` must be the SAME array until the levels change: the tree is memoised on it (the hook builds a new tree every render while `data` is undefined).
- `waitForLevels(vaultId): Promise<void>`: settle when the first level read has finished; reject if it failed. GilbApp: `waitForLevels(qc, vaultId)`, lines 462-468 (`qc.fetchQuery`, not retried).
- `ensureDefaultLevels(vaultId): Promise<GridRecord[]>`: read every level afresh and, only when the vault has none, write the four defaults (once, also for two calls at the same time); return the levels now stored. A failed read writes nothing. GilbApp: `ensureDefaultLevels(vaultId, qc)`, lines 359-369 (with `readThenMaybeWriteDefaults` and `writeDefaults`, 372-396). The host writes `DEFAULT_LEVELS` entries with `unitTag: tagOf(token)`, `label`, `levelPosition: position` and `ontologyTerm`.
- `addProjectLevel(vaultId, label, parentToken): Promise<string>`: ensure the defaults, then create one level under `parentToken` (`null` is a main level) and return its token. GilbApp: `addProjectLevel(vaultId, qc, label, parentToken)`, lines 426-456. It can use `pascalCase`, `tagOf`, `tokenOf`, `levelTag`, `directChildren` and `nextPosition` of this unit.
- `ensureDefaultLevels` and `addProjectLevel` are writers. They are required, not optional: the hook has no read-only flag in the source, and `ensure` and `add` are only ever called by a card that is editing. A host that never writes should pass functions that reject.
- A term origin set once with `setTermOrigin` (the `term-origin` unit) before the defaults' `ontologyTerm` is read; and, if the app has its own type registry, one `setTypeKey` call (the `type-key` unit).

## Do not

- Do not return a new `data` array on every render from `useAllLevels`: the tree is rebuilt each time and every chooser below re-renders.
- Do not read `DEFAULT_LEVELS[i].ontologyTerm` (or spread the entries, or `JSON.stringify` them) before `setTermOrigin`: it throws.
- Do not write the defaults on a view. Write them from `ensureDefaultLevels` only, only after a fresh read of every level found none, and never when the read failed.
- Do not install a second copy of `term-origin` or `type-key`: each holds module state.
- Do not store `ADD_LEVEL` as a level; it only opens the add form.

## Wrong readings

- "`hasStored` is true when the query returned something." It is true only when the read succeeded and returned at least one level record.
- "`tree` is the empty list for a vault with no levels." It is the four defaults.
- "`ensure` and `add` read first." They wait only when the query is neither a success nor a failure; once it has succeeded they go straight to the host's writer.
- "`pascalCase` keeps accents." It splits on any character outside A-Z, a-z, 0-9, so `ünï` is `N`.
- "A level whose parent cannot be found is dropped." It is a root.
- "`levelKnown` is false for an empty token." An empty token is unset and counts as known.
- "`ontologyTerm` is a fixed string." It is read from the term origin each time, so it follows `setTermOrigin`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/lib/base/planLevels.ts` to `src/planLevels.ts`: line 20 (`LEVELS_UNREAD`), lines 26-30, 33-226 (the constants, `LevelRecord`, `LevelNode`, `tokenOf`, `tagOf`, `pascalCase`, `isDefaultLevelToken`, `levelKnown`, `isCauseEffectLevel`, the private helpers `rawFact` to `compareLevels`, `levelTree`, `defaultLevelTree`, `pickerNodes`, `optionLabel`), lines 398-423 (`directChildren`, `nextPosition`, `levelTag`) and lines 470-496 (`unreadError`, `useProjectLevels`). Code verbatim except the named changes below. Imports: `./planCard` (`rowServedFact`) is `@kaigilb/gilbplatformcode-plan-card-facts`; `./planLinks` (`isTypeName`) is `@kaigilb/gilbplatformcode-type-key`; the type `GridRecord` of `./recordHooks` is `@kaigilb/gilbplatformcode-base-record`; `react` is unchanged. The imports of `@tanstack/react-query`, `./records`, `./recordTypes`, `./relationWrite`, `./planRequestLimit` and `./vaultSets` are removed with the code that used them.
  1. `const VEDA = "https://veda.gilb.com/base/t"` (line 31) is removed, and the `ontologyTerm` of each entry of `DEFAULT_LEVELS` (lines 39-42) is a getter. The source evaluated `DEFAULT_LEVELS` when the module loaded, before an app can set the term origin, so each entry is now `get ontologyTerm() { return `${termOrigin()}/base/t/BusinessLevel`; }` (and the same with `StakeholderLevel`, `ProductLevel`, `SolutionLevel`, the names of the source's literals). Read after `setTermOrigin` with the app's origin, it gives the string the source had. `termOrigin` is `@kaigilb/gilbplatformcode-term-origin`.
  2. `useQueryClient()` (line 480) is `useContext(ProjectLevelsHostContext)`, throwing an error that names the provider when there is none. `useAllLevels(vaultId)` (line 481) is `host.useAllLevels(vaultId)` (host member 1). `waitForLevels(qc, vaultId)` (lines 487 and 492) is `host.waitForLevels(vaultId)` (member 2). `ensureDefaultLevels(vaultId, qc)` (line 488) is `host.ensureDefaultLevels(vaultId)` (member 3). `addProjectLevel(vaultId, qc, label, parentToken)` (line 493) is `host.addProjectLevel(vaultId, label, parentToken)` (member 4). In the two dependency arrays `qc` is `host`. The calls are in the source's places and order.
  3. `directChildren` (line 398) and `nextPosition` (line 411), private in the source, are exported, so a host can write `addProjectLevel` with them.
- Left in the app (host members or their helpers, not in this unit): `planLevelsKey`, `readLevelTree`, `gridFromListed`, `readAllLevels`, `useAllLevels`, `factString`, `levelGrid`, `rememberLevels`, `ensureDefaultLevels`, `readThenMaybeWriteDefaults`, `writeDefaults`, `addProjectLevel`, `waitForLevels`, `LEVEL_LIST_PAGE_CEILING` and the in-flight map (lines 17-24, 228-396 except 398-423, 425-468).

`src/projectLevelsHost.ts` (the host interface and its context) and `src/index.ts` are new.

Tests:

| Source | Ported / left out |
|---|---|
| `src/lib/base/planLevels.vaultit.test.ts`, `describe("levelTree")` (2 cases) | Ported to `src/planLevels.test.ts` with the same inputs and expectations; the host name is example.test. |
| `src/lib/base/planServedShapes.vaultit.test.ts`, "reads a level's bare levelPosition and partOf" (1 case) | Ported to `src/planLevels.test.ts` (the other cases of that file test other cards). |
| `planLevels.vaultit.test.ts`, `readAllLevels` (4 cases) and `rememberLevels` (1 case) | Left out: they test the app's reads and cache writes, which are the host's. |

`src/planLevels.test.ts` also pins every other pure export (the odd cases included: `pascalCase("ünï")` is `"N"`, the parent forms, the sort ties, an unreachable cycle), and the getter of `DEFAULT_LEVELS`. `src/useProjectLevels.test.tsx` is new and pins the hook against a fake host: the tree and `hasStored`, the memo on the host's `data`, and the order of the host's calls in `ensure` and `add`. `src/example.test.tsx` runs the README example, `src/exports.test.ts` pins the export list, and `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
