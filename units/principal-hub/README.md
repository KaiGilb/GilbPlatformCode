# principal-hub

## What this is

One place that knows whose session a tab is in, and clears every registered in-memory cache of a person's content when the person changes.

Plain functions, no React, no network, no import. A module that keeps a person's content in memory registers a clear function with the hub. When the person changes (another person signs in, a sign-out, or the first person after nobody), the hub calls every clear function at once, before the next person's first render. An async load that started for the old person asks the hub whether the person is still the same when its answer arrives, and drops the answer if not.

- `setPrincipal(next)`: says whose tab this is (`null` is nobody). A different person clears every cache first. The same person again changes nothing. Call it before anything of the new person is read or shown.
- `currentPrincipal()`: the person now, or `null`.
- `registerCache(name, clear)`: registers a cache. `clear(next)` is told who comes next (`null` is nobody), so a cache kept on the device can keep what is the same person's and clear the rest. Registering the same name again replaces the clear function.
- `registeredCaches()`: the registered names.
- `clearAllCaches(next = current)`: clears every registered cache now, and raises the version. A cache that throws does not stop the others.
- `principalVersion()`: a number that goes up each time the caches are cleared.
- `principalGuard()`: call it when a load starts; it returns a function. Ask that function when the answer arrives: `false` means the person changed in between, so drop the answer.
- `guardLate(promise, land)`: the same in one call. `land` runs only if the person is still the one who asked. The promise's value is returned either way.
- `__freshPageForTests()`: for tests only. The tab has no person yet and nothing is cleared, as after a page reload.

## What this is not

- Not a store of the person: it holds only an identifier string you give it and the list of clear functions.
- Not a sign-in: the host decides who the person is and calls `setPrincipal`.
- Not a scan: it does not find caches that forgot to register. A host that wants that writes its own test over its source.

## How to take it

Package: `@kaigilb/gilbplatformcode-principal-hub`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/principal-hub
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency.

## Examples

```ts
import { guardLate, registerCache, setPrincipal } from "@kaigilb/gilbplatformcode-principal-hub";

const answers = new Map<string, string>();
registerCache("answers", () => answers.clear());

setPrincipal("https://ann.example.test/vault"); // a sign-in
guardLate(fetchSomething(), (value) => answers.set("k", value)); // dropped if the person changes first
setPrincipal("https://ben.example.test/vault"); // answers is cleared now; Ann's late answer never lands
```

## What the host must supply

- The call to `setPrincipal` at each sign-in and sign-out. Nothing else; there is no setting and no start-up call.

## Module state

The current person, a version number and the map of registered caches, at module level. A unit that holds module state must exist once in an app: two installed copies would split "who is signed in" and silently break the clear on a change. Every unit that registers a cache takes this one as a peer.

Dynamic imports in the files taken: none.

## Do not

- Do not compare versions by hand at a call site; use `principalGuard` or `guardLate`.
- Do not register a cache that holds nothing of a person: it only costs a call.
- Do not call `__freshPageForTests` outside a test.

## Wrong readings

- "`setPrincipal` with the same person refreshes the caches." It does nothing; call `clearAllCaches` to clear.
- "`guardLate` cancels the promise." It does not; the promise still resolves and returns its value, only `land` is skipped.
- "`principalVersion` is the person." It counts clears, and a clear called by hand (`clearAllCaches`) raises it too.

## Where it came from

`KaiGilb/Social` (private repo), commit `a1f65a5b2567d5dbdfa91fa8e64e7b2af84fa66e`, copied by script: `src/lib/principalHub.ts` lines 1-48 to `src/principalHub.ts`.

Named changes, and only these: the first comment line loses its cycle tag, and the fourth no longer names the source app's test file. No code changed. `src/index.ts` is new.

Tests (`src/*.test.ts`; no shared set-up): `principalHub.test.ts`. The first two tests are ported from the source app's `p154-principal-hub.test.tsx` ("one hub, every cache registered": the clear on a change of person, and a cache that throws), with the people renamed Ann and Ben. The others are new and pin every export and a late answer after a change of person. `hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out: the rest of the source test files that name the hub (they run the app's pages, caches, bridge or a stubbed platform, or scan the app's own source).
