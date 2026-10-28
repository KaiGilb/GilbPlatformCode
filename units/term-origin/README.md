# term-origin

The one setting "which origin serves the GilbVeda type documents", so every Plan unit builds type addresses the same way.

## What this is

The one setting "which origin serves the GilbVeda type documents". A Plan unit that has to write a type address (`<origin>/base/t/<Name>`, for example the Value card's default Endpoint) asks `termOrigin()` and builds the address from it, so all of them build it the same way. A shared unit must not name a host, so the app sets the origin once at start-up. Plain functions, no React, no network.

- `setTermOrigin(origin)`: set the origin. The text is trimmed and one trailing `/` is removed. It throws a `TypeError` (message starts with `term-origin:`) when the text is empty or does not start with `http://` or `https://`.
- `termOrigin()`: the origin that was set. If it was never set, it throws an `Error`: `term-origin: call setTermOrigin(<origin>) once at start-up`.
- `resetTermOrigin()`: forget the origin (for tests).

The unit holds one piece of module state (the origin). An app must have ONE copy of it: every unit that builds a type address takes this unit as a peer dependency (`^0.1.0`), and the app installs it once.

## What this is not

- Not a type registry and not a fetcher. It never asks the origin anything; it only keeps the text.
- Not a URL parser. It checks the start of the text and trims the end; it does not check that a host follows.
- Not a default. There is no built-in origin: a unit that needs one throws until the app has set it.

## How to take it

Package: `@kaigilb/gilbplatformcode-term-origin`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/term-origin
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. A unit that builds type addresses lists this one under `peerDependencies`, never under `dependencies`.

## Examples

```ts
import { setTermOrigin, termOrigin } from "@kaigilb/gilbplatformcode-term-origin";

// Once at start-up, before any card renders: the app's GilbVeda origin.
setTermOrigin("https://<your ontology host>");

termOrigin(); // "https://<your ontology host>"
`${termOrigin()}/base/t/Person`; // the address of the Person type
```

## What the host must supply

- One call to `setTermOrigin("https://<your ontology host>")` at start-up, before any card renders. The value is the app's GilbVeda origin: the origin that serves the type documents at `/base/t/<Name>`.

## Do not

- Do not call `setTermOrigin` per render or per record: it changes the address every unit builds, all at once.
- Do not install a second copy of this unit: a unit that reads the origin would read a copy your `setTermOrigin` never set, and throw.
- Do not put a path or a trailing slash you do not mean: a path is kept as typed (only one final `/` is cut).

## Wrong readings

- "It is cleaned up like a URL." It is not: the text is trimmed and ONE final `/` is cut. `https://x.test//` gives `https://x.test/`. A path is kept: `https://x.test/a/` gives `https://x.test/a`.
- "A scheme alone is refused." It is not: `https://` passes the start check and, with its last `/` cut, is kept as `https:/`. The unit checks the start of the text only.
- "The scheme check ignores case." It does not: `HTTPS://x.test` is refused.
- "A refused value clears the old one." It does not: a `TypeError` leaves the earlier origin as it was.
- "`termOrigin()` has a fallback." It has none: before `setTermOrigin` it throws.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`: the setting is one constant there, `TYPE_TERM_ORIGIN` in `src/lib/base/typePicture.ts` (line 18), re-exported as `GILBVEDA_MASTER_ORIGIN` in `src/lib/base/stakeholderKinds.ts` (line 39). A shared unit must not name the host, so this unit replaces the constant with a setting the app sets.

`src/termOrigin.ts` and `src/index.ts` are new: no source lines are copied. The tests are new, pinned from the code's own results. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
