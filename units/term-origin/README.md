# term-origin

The one setting "which origin serves the GilbVeda type documents", so every Plan unit builds type addresses the same way.

## What this is

The one setting "which origin serves the GilbVeda type documents", so every Plan unit builds type addresses the same way.

The one setting "which origin serves the GilbVeda type documents". A Plan unit that has to write a type address (`<origin>/base/t/<Name>`, for example the Value card's default Endpoint) asks `termOrigin()` and builds the address from it, so all of them build it the same way. A shared unit must not name a host, so the app sets the origin once at start-up. Plain functions, no React, no network.

- `setTermOrigin(origin)`: set the origin. The text is trimmed and parsed with `new URL(...)`. It must be an `http:` or `https:` origin only: a host (with an optional port), a path of `/` at most, no query, no fragment and no user name or password. Otherwise it throws a `TypeError` (message starts with `term-origin:` and names what was wrong), and the earlier origin stays. What is stored is the URL standard's `origin`, so a trailing `/`, an explicit default port (`:443` on https, `:80` on http) and upper-case letters in the scheme or host are normalised.
- `termOrigin()`: the origin that was set. If it was never set, it throws an `Error`: `term-origin: call setTermOrigin(<origin>) once at start-up`.
- `resetTermOrigin()`: forget the origin (for tests).

The unit holds one piece of module state (the origin). An app must have ONE copy of it: every unit that builds a type address takes this unit as a peer dependency (`^0.1.0`), and the app installs it once.

## What this is not

- Not a type registry and not a fetcher. It never asks the origin anything; it only keeps the text.
- Not a URL builder. It accepts an origin and nothing longer; it does not join paths.
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
- Do not pass a path, a query or a fragment (`https://host/base`, `https://host?x=1`): it throws. Pass the origin, and let each unit add `/base/t/<Name>`.

## Wrong readings

- "It keeps the text as typed." It keeps the URL standard's origin: `https://Ontology.Example.Test:443/` is stored as `https://ontology.example.test`, and `http://example.test:8080` keeps its port.
- "A path is allowed if it is the ontology's." It is not: `https://example.test/base` and `https://example.test//` throw (a path other than `/`). The same for `?x=1` (even a bare `?`), `#top` (even a bare `#`) and `user:secret@` in front of the host.
- "A scheme alone is an origin." It is not: `https://` is not a URL and throws; so do `ftp://example.test` and `file:///x` (the scheme must be http or https).
- "The scheme check is case-sensitive." It is not: `HTTPS://example.test` is stored as `https://example.test`.
- "A refused value clears the old one." It does not: a `TypeError` leaves the earlier origin as it was.
- "`termOrigin()` has a fallback." It has none: before `setTermOrigin` it throws.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`: the setting is one constant there, `TYPE_TERM_ORIGIN` in `src/lib/base/typePicture.ts` (line 18), re-exported as `GILBVEDA_MASTER_ORIGIN` in `src/lib/base/stakeholderKinds.ts` (line 39). A shared unit must not name the host, so this unit replaces the constant with a setting the app sets.

`src/termOrigin.ts` and `src/index.ts` are new: no source lines are copied. The tests are new, pinned from the code's own results. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
