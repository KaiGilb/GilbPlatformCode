# base-origin

The one place an app sets the GilbPlatform origin and the hosts allowed to receive its credential, so every address and credential rule reads them the same way.

## What this is

The one place an app sets the GilbPlatform origin and the hosts allowed to receive its credential, so every address and credential rule reads them the same way.

A unit that builds a vault address, or decides whether a URL may receive the app's token, asks this unit for two facts: the origin of the platform (`baseOrigin()`) and the list of system vault hosts (`systemVaultHosts()`). A shared unit must not name a host, so the app sets both once at start-up. Plain functions, no React, no network.

- `setBaseOrigin(origin)`: set the platform origin. The text is trimmed and parsed with `new URL(...)`. It must be an `http:` or `https:` origin only: a host (with an optional port), a path of `/` at most, no query, no fragment, no user name or password. Otherwise it throws a `TypeError` (message starts with `base-origin: setBaseOrigin:`), and the earlier origin stays. What is stored is the URL standard's `origin`.
- `baseOrigin()`: the origin that was set. If it was never set, it throws an `Error`: `base-origin: call setBaseOrigin(<origin>) once at start-up`.
- `resetBaseOrigin()`: forget the origin (for tests).
- `setSystemVaultHosts(hosts)`: set the bare host names of the platform's system vaults (for example `["vault-one.example.test"]`). Each name is trimmed and lower-cased; a name that is not a bare host (a scheme, a port, a path, a user name, a space) throws a `TypeError` and the earlier list stays. An empty list is allowed.
- `systemVaultHosts()`: the list as a `ReadonlySet<string>` (use `.has(hostname)`). Throws when never set.
- `resetSystemVaultHosts()`: forget the list (for tests).

Four more settings are optional and belong to the term and type search reads:

- `setOntologyApiOrigin(origin)` / `ontologyApiOrigin()` / `resetOntologyApiOrigin()`: the origin that answers the public term search when it is not the platform origin. Same rules as `setBaseOrigin`. Unset gives `undefined` (no override); a blank text clears it.
- `setMinOntologyQuery(n)` / `minOntologyQuery()` / `resetMinOntologyQuery()`: the shortest query, in letters, that reaches the ontology. A whole number of 0 or more. Unset gives `3`.
- `setPublicCorpusOrigin(origin)` / `publicCorpusOrigin()` / `resetPublicCorpusOrigin()`: the origin of the public term corpus, used instead of the platform origin when that origin is a local rig that holds no ontology. Same rules as `setBaseOrigin`. Throws when never set. A unit reads it ONLY inside the local-rig branch, so a production host never needs it.
- `setLocalRigHosts(names)` / `localRigHosts()` / `resetLocalRigHosts()`: the bare host names (an IPv6 literal in brackets) of a local development rig. A rule that applies only on a local rig tests `localRigHosts().has(<the platform origin's host>)`. The default is the empty set, so every rig branch is NOT taken until the app names its rig hosts.

The unit holds module state. An app must have ONE copy of it: every unit that reads these settings takes this unit as a peer dependency (`^0.1.0`), and the app installs it once.

## What this is not

- Not an address builder and not a credential rule. It keeps the two facts; the unit that builds addresses and decides who gets the credential reads them.
- Not a fetcher. It never asks the origin anything.
- Not a default. There is no built-in origin and no built-in host list: a unit that needs one throws until the app has set it.

## How to take it

Package: `@kaigilb/gilbplatformcode-base-origin`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/base-origin
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. A unit that reads these settings lists this one under `peerDependencies`, never under `dependencies`.

## Examples

```ts
import { baseOrigin, setBaseOrigin, setSystemVaultHosts, systemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";

// Once at start-up, before any card renders.
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.example.test", "places.example.test"]);

baseOrigin(); // "https://platform.example.test"
systemVaultHosts().has("ontology.example.test"); // true
```

## What the host must supply

- One call to `setBaseOrigin("https://<your platform origin>")` at start-up, before any unit builds an address.
- One call to `setSystemVaultHosts([...])` at start-up with the bare host names of the platform's system vaults (an empty list if you have none).
- Optionally `setLocalRigHosts` (a development build names its rig host here, for example the loopback name it serves from; a production build leaves it empty), `setOntologyApiOrigin`, `setMinOntologyQuery` and `setPublicCorpusOrigin`, if the term and type search units are used and the defaults above are not right.

## Do not

- Do not call the setters per render or per record: they change every address and the credential rule, all at once.
- Do not install a second copy of this unit: a unit that reads the settings would read a copy your setters never set, and throw.
- Do not pass a path, a query or a fragment to an origin setter (`https://host/base`, `https://host?x=1`): it throws. Pass the origin.
- Do not put a scheme or a port in a system vault host (`https://host`, `host:8443`): it throws. Pass the bare host name.

## Wrong readings

- "It keeps the text as typed." It keeps the URL standard's origin: `HTTPS://Platform.Example.Test:443/` is stored as `https://platform.example.test`.
- "There is a development default." There is none. The app this came from falls back to a local address when its environment names no origin; this unit throws instead, so a missing setting is seen at start-up and not as a request to the wrong host.
- "`publicCorpusOrigin()` has a default." It has none. The app this came from falls back to a fixed public address; here the app sets it, and it is read only when the platform origin is a local rig.
- "The local-rig rules work by default." They do not: the app this came from tested for a fixed local name in code; here the rule is off until `setLocalRigHosts` names the rig host. A development build that forgets it addresses a rig vault over `https` and fails the way the app did before its rig rule.
- "A refused value clears the old one." It does not: a `TypeError` leaves the earlier value as it was.
- "`minOntologyQuery` reads the environment." It does not. The app this came from read an environment value and fell back to 3 when the value was missing or not a whole number; here the app passes the number, and a value that is not a whole number of 0 or more is refused with a `TypeError`.
- "`setOntologyApiOrigin` keeps any text." It keeps an origin only. The app this came from used any non-blank environment text with one trailing `/` removed; here a text that is not an http or https origin throws.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`. No source lines are copied; this unit replaces six host literals with settings:

- `BASE_ORIGIN`, `src/lib/base/config.ts` lines 16-17 (the environment value `VITE_BASE_ORIGIN`, falling back to a local address): replaced by `setBaseOrigin` / `baseOrigin()`.
- `SYSTEM_VAULT_HOSTS`, `src/lib/base/config.ts` lines 161-167 (a fixed set of five host names): replaced by `setSystemVaultHosts` / `systemVaultHosts()`.
- The environment value `VITE_ONTOLOGY_API_ORIGIN`, `src/lib/base/termSearch.ts` lines 86-87: replaced by `setOntologyApiOrigin` / `ontologyApiOrigin()`.
- `PUBLIC_CORPUS_ORIGIN`, `src/lib/base/termSearch.ts` line 67 (a fixed public address): replaced by `setPublicCorpusOrigin` / `publicCorpusOrigin()`.
- The local-rig tests: `base.hostname === "localhost"`, `src/lib/base/config.ts` line 138, and `isLocalDevHost` (three loopback names), `src/lib/base/termSearch.ts` lines 69-76: replaced by `setLocalRigHosts` / `localRigHosts()`; the empty default means the branch is not taken.
- The environment value `VITE_MIN_ONTOLOGY_QUERY` and `DEFAULT_MIN_ONTOLOGY_QUERY`, `src/lib/base/typeSearch.ts` lines 517-524: replaced by `setMinOntologyQuery` / `minOntologyQuery()`; the default 3 is kept.

`src/baseOrigin.ts` and `src/index.ts` are new: no source lines are copied. The origin check in `setBaseOrigin` is the same as the `term-origin` unit's. The tests are new, pinned from the code's own results. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
