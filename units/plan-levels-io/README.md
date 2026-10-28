# plan-levels-io

Reads every level of a project's vault page by page, writes the four default levels once when the vault has none, and adds one level, for the level chooser of a Plan card.

## What this is

Reads every level of a project's vault page by page, writes the four default levels once when the vault has none, and adds one level, for the level chooser of a Plan card.

A project's levels are `CauseEffectLevel` records in its vault. `project-levels` holds the rules over them (the tree, the tags, the defaults) and the hook a card calls, with a host that does every read and write. This unit is those reads and writes: the four calls that host needs, over one `QueryClient` (the app's `@tanstack/react-query`).

- `useAllLevels(vaultId)`: a hook; every level record of the vault as a query keyed by `planLevelsKey(vaultId)`, enabled when `vaultId` is not empty, never retried. Its answer has `data`, `isSuccess`, `isError` and `error`, as the `project-levels` host reads them.
- `waitForLevels(qc, vaultId)`: settles when the level read has finished once (`qc.fetchQuery` of the same key, not retried); rejects when it failed.
- `ensureDefaultLevels(vaultId, qc)`: a fresh read of every level (never the cache), and only when the vault has none the four defaults, written one after another, each put in the caches as it lands; answers the levels now stored. A failed read writes nothing. Two calls for one vault at the same time share one read and one set of writes.
- `addProjectLevel(vaultId, qc, label, parentToken)`: refuses a label with no letter or digit and a parent the project does not have, ensures the defaults, then creates one level under `parentToken` (`null` is a main level) with its tag continuing the parent's, the next position among its siblings and `ontologyTerm: "none"`, links it to the parent's address as `a:partOf`, remembers it, and answers the new token.
- `readAllLevels(vaultId, qc?)`: every `CauseEffectLevel` of the vault, not the grid's recency page: follows `nextOffset`, stops on `complete`, on an empty page or on a next offset that does not advance, asks for the documents with the page (a row with none is one record read, through the client's read limiter when `qc` is given), and throws "Could not read every level of this vault." at fifty pages or when a row cannot be read.
- `rememberLevels(qc, vaultId, rows)`: puts rows into the levels' cache (replacing by id) and, only when the vault's grid already has a first page, into that page.
- `readLevelTree(qc, vaultId)`: the tree of the levels the cache holds (empty when it holds none). `planLevelsKey(vaultId)`: `["base", "plan-levels", vaultId]`.

## What this is not

- Not the tree, the tags or the chooser: those are `project-levels`.
- Not a sign-in: every call that leaves the unit goes to a peer, which signs it through the auth seam (`lws-session-bridge`).
- Not the host of `project-levels` itself: that has four members with no query client, and this unit's functions take one (the source's signatures). The README example shows the four lines that join them.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-levels-io`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/plan-levels-io` prints:

```sh
npm install <path-to-the-library>/units/plan-levels-io
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each, so one level read in flight per vault):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. `@tanstack/react-query` is a peer at run time: the hook, the cache writes and the grid's list (`plan-record-hooks`) must see ONE copy of it.

## Examples

The host of `project-levels` made from this unit; the same code runs in `src/example.test.tsx`.

```tsx
import { useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ADD_LEVEL, ProjectLevelsHostContext, optionLabel, pickerNodes, useProjectLevels, type ProjectLevelsHost } from "@kaigilb/gilbplatformcode-project-levels";
import { addProjectLevel, ensureDefaultLevels, useAllLevels, waitForLevels } from "@kaigilb/gilbplatformcode-plan-levels-io";

function LevelsHost({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const host = useMemo<ProjectLevelsHost>(
    () => ({
      useAllLevels,
      waitForLevels: (vaultId) => waitForLevels(qc, vaultId),
      ensureDefaultLevels: (vaultId) => ensureDefaultLevels(vaultId, qc),
      addProjectLevel: (vaultId, label, parentToken) => addProjectLevel(vaultId, qc, label, parentToken),
    }),
    [qc],
  );
  return <ProjectLevelsHostContext.Provider value={host}>{children}</ProjectLevelsHostContext.Provider>;
}

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

const app = (qc: QueryClient) => (
  <QueryClientProvider client={qc}>
    <LevelsHost>
      <LevelChooser vaultId="https://plan.example.test/vault" current="Product" />
    </LevelsHost>
  </QueryClientProvider>
);
```

## What the host must supply

- The settings the peers need, once at start-up: `setBaseOrigin(...)` and `setSystemVaultHosts([...])` from `base-origin`; `setTermOrigin(...)` from `term-origin` (the defaults' `ontologyTerm` is read from it when the default is written, so it must be set before the first write); `setLwsAuth(host)` from `lws-session-bridge`.
- One `QueryClient` per app, given to a `QueryClientProvider`, and the same one the grid's list uses.
- The `ProjectLevelsHostContext` provider of `project-levels`, with the four members as in the example.

## Module state

One map, `inflight`: the read-then-write of `ensureDefaultLevels`, per vault id. An app must have ONE copy of this unit (two copies would each keep their own map, and two calls for one vault could both write the defaults).

## Do not

- Do not call `ensureDefaultLevels` or `addProjectLevel` from a view. They write; the defaults are written only when a level is set or added, and only after a fresh read of every level found none.
- Do not read `DEFAULT_LEVELS[i].ontologyTerm` before `setTermOrigin` (`project-levels`): it throws, and so does the first default write.
- Do not give `readAllLevels` a client for a different cache than the one the hook uses: its read limiter is per client.

## Wrong readings

- "`ensureDefaultLevels` shares work between query clients." It shares it by vault id only. The map is not keyed by client: a second client asking for the same vault while the first is reading is handed the first call's answer, and the cache writes of that call went to the first client.
- "`addProjectLevel` reads the levels it needs from the vault." It reads them from the cache, after `ensureDefaultLevels` has put a fresh read there.
- "A listed row without its document is dropped." It is one record read at the address the list gave it, and the type and the time come from the list, not from the read.
- "`rememberLevels` creates the grid's list." It does not: with no first page in the grid's cache it writes only the levels' cache.
- "The ceiling is a page count of the vault." It is a count of the requests of one walk; a vault of fifty pages or more of levels is an error, not a short list.
- "`waitForLevels` is the hook's read." It is a second reader of the same key (`fetchQuery`); the hook calls it only when its own query is neither a success nor an error yet.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, copied by script:

- `src/lib/base/planLevels.ts` to `src/planLevelsIo.ts`: lines 17-18, 20, 22-24, 228-302, 304-396, 425-468 (`LEVEL_LIST_PAGE_CEILING`, `LEVELS_UNREAD`, `planLevelsKey`, `liveLevels`, `readLevelTree`, `gridFromListed`, `readAllLevels`, `useAllLevels`, `factString`, `levelGrid`, `rememberLevels`, the in-flight map, `ensureDefaultLevels`, `readThenMaybeWriteDefaults`, `writeDefaults`, `addProjectLevel`, `waitForLevels`).

Named changes, and only these:

1. the imports are replaced by imports of the peers `base-record` (`GridRecord`), `lws-records` (`createRecord`, `readRecord`, `recordFromServed`, `withTypeUri`, `RecordCreateFacts`), `lws-relations` (`memberEntityUri`), `lws-vault-sets` (`listVaultRecordsPage`, `planReadLimit`, `VaultRecordRef`), `project-levels` (`DEFAULT_LEVELS`, `directChildren`, `levelTag`, `levelTree`, `nextPosition`, `pascalCase`, `tagOf`, `tokenOf`, `LevelNode`), `record-cache-kit` (`recordsKey`, `RecordsPage`), `record-types` (`typeUriForVaultNamespace`) and `@tanstack/react-query`; `react` is not imported;
2. `async function waitForLevels(` (line 462) is `export async function waitForLevels(`: private in the app, where the hook beside it called it; the host of `project-levels` calls it as its member `waitForLevels`;
3. `DEFAULT_LEVELS`, `levelTree`, `tokenOf`, `tagOf`, `pascalCase`, `directChildren`, `nextPosition` and `levelTag` are not copied: `project-levels` holds them, each compared with the source's (comments stripped; the entries of `DEFAULT_LEVELS` differ only in the getter that unit names, so the string written is `${termOrigin()}/base/t/BusinessLevel` and its three siblings, read when the default is written); `directChildren` and `nextPosition` are the exports that unit added for a host that writes a level;
4. the comment on the page ceiling and the one on `readAllLevels` no longer name a file of the app; no code changed.

`src/index.ts` is new. No `bearerHeaderFor` call is in the file taken (the writes are `createRecord` of `lws-records`, which signs its POST with the method). **Dynamic imports in the file taken: none** (`grep "import("` of `planLevels.ts`).

**Merged units compared with the app's functions (each reached symbol, comments stripped).** `project-levels`: `levelTree`, `tokenOf`, `tagOf`, `pascalCase`, `levelTag`, `directChildren`, `nextPosition` are equal (the last two exported there); `DEFAULT_LEVELS` differs only by the getter that unit names. `lws-records` (0.3.0): `createRecord`, `readRecord`, `recordFromServed`, `withTypeUri`, `RecordCreateFacts` are equal. `lws-vault-sets`: `listVaultRecordsPage`, `VaultRecordRef`, `planReadLimit` are equal. `lws-relations`: `memberEntityUri` differs only in `baseOrigin()` for `BASE_ORIGIN`. `record-cache-kit` (0.2.0): `recordsKey`, `RecordsPage` are equal. `record-types`: `typeUriForVaultNamespace` is equal. `base-record`: `GridRecord` is equal.

Tests (`src/*.test.ts` and `.tsx`; shared set-up in `test/support.ts` and `test/levelsWire.ts`, not shipped):

| Source | Ported / left out |
|---|---|
| `lib/base/planLevels.vaultit.test.ts`, `readAllLevels` (4 cases) and `rememberLevels` (1 case) | Ported to `src/planLevelsIo.test.ts`: the same inputs and expectations; the app's mock of its token manager is the fake host of the auth seam, and the host is an example.test host. |
| `planLevels.vaultit.test.ts`, `levelTree` (2 cases) | Left out: they test `levelTree`, which is `project-levels`'s (ported there). |
| `lib/base/planServedShapes.vaultit.test.ts` (8 cases) | Left out: they test the Plan card's readers (`readMeters`, `readLevelLines`, `readLineSources`), the part readers, the impacts and `readPartOfFact`, which are other units; the one case on `levelTree` is ported in `project-levels`. |

New: `src/planLevelsIo.behaviour.test.ts` (every export and the odd path of each: a listed row without its document, the stops of the page walk and the ceiling, the type and the time of a listed row, the address a row is read at, the register filter, the read limiter across calls on one client, the defaults written once and their term read when written, a failed read forgotten, a level added at the top and under a parent, the fallback ids, the caches), `src/useAllLevels.test.tsx` (the hook), `src/example.test.tsx` (the README example, with `project-levels`' hook over this unit), `src/exports.test.ts` and `src/hostAgnostic.test.ts` (the same host-agnostic check test as the other units). Mutation checks: 59 mutants of `planLevelsIo.ts` (`pilot/b3c/tools/specs/m9-plan-levels-io.result.txt`): 59 of 59 killed.
