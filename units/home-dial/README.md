# home-dial

Finds the holder's home country calling code, to prefill a new phone number.

## What this is

Finds the holder's home country calling code, to prefill a new phone number.

A phone row's code box starts with the calling code of the country the holder's home address sits in ("47" for Norway), so a new number needs only the national part. The code is a fact on the country, read from the catalogue; it is never kept in a list here.

- `useHomeDial(claims, resolveAncestry?)`: a hook. Returns the digits of the home address country's calling code, or `""`. `claims` are the holder's address claims (`HomeDialClaim`: `label`, `uri`, `placeIds`). Which claim may prefill: the one labelled "home" (trimmed, any case); else the only claim when there is exactly one; else none (several and no home is not a guess). From that claim it walks the place ids in order, asking the host's `resolveAncestry(id)` for the country each sits in, until one has a country; then it reads that country's document. **Exactly one code prefills; two codes pick neither; no code, a failed walk, a refused read: `""`.** An answer that arrives after the hook was left, or after a newer walk started, is dropped. A new claims array with the same address (same `uri` and place ids) does not restart the walk.
- `ResolveAncestry`: `(id) => Promise<{ country?: { id: string } | null }>`: the host's answer to "which country does this place sit in". `country.id` is the country's own address in the catalogue.
- `noAncestry`: the default: it knows no place's country, so the hook answers `""` and **makes no request**. A host that has no place claims (or no geo catalogue) gets "nothing is prefilled".
- `readCountryCallingCodes(countryAddress, signal?)`: the request: one GET at the address it is given; returns the document's valid codes (`"+47"`, one to three digits), once each. A refused read throws `Country read <status>`.
- `joinPhone(dial, national)`: the app's join of a code box and a number box into one stored phone (see the next section).

The holder's address claims are a later unit (they need the place-claim reads). Until a host gives them, it passes `[]` (as the source's card does) or a `useHomeDial` member that ignores them, and then nothing is prefilled.

## The false friend: which `joinPhone` is which

This unit's `joinPhone` is **the app's**, and it is not the `joinPhone` of `phone-text`. The only difference (measured, both token-compared and run on 16 inputs): the app returns a national number that already starts with `+` as it is (`joinPhone("47", "+4790012345")` is `"+4790012345"`); `phone-text` has no such line and puts the code in front (`"+47 +4790012345"`). They agree on every input whose national part does not start with `+`, and when no code is given. A phone box that mixes the two functions would save a doubled code. `PhoneValue` (unit `phone-value`) and `contact-rows` take the app's. `contact-rows` holds a second copy of this same function in its own `dialCode.ts` (token-equal, 38 words); it should import this unit's in its next version.

The rest of the app's phone-parts file is `phone-text`'s and is imported, not copied: `splitPhone`, `claimLabeledHome` and `callingCodesOf` are token-equal to the app's (0 diff lines each); `claimForPhonePrefill` differs in two tokens of text (`return claims[0]!;` against `const only = claims[0]; return only ?? null;`) and returns the same on every input (compared on 8 lists in a test, with the app's function written out as the oracle).

## What this is not

- Not the place-claim reads, and not the walk from a place to its country: those are the host's (`resolveAncestry`).
- Not a list of countries or codes. A code is never turned back into a country.
- Not the phone boxes (`phone-value`) and not the stored phone's reader (`splitPhone`, in `phone-text`).
- Not a guess: two codes (a country with two) and several addresses with none labelled home prefill nothing.

## How to take it

Package: `@kaigilb/gilbplatformcode-home-dial`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/home-dial` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

None. No markup, no class, no CSS variable.

## Requests and their servers

One request, and only when it is needed: `GET <country address>` with `Accept: application/json`, no credential, no other header, with the hook's abort signal. It is made only when the walk found a country, i.e. only when the host's `resolveAncestry` returned one. **The unit names no host.** The origin is the country's own address, which is what the host's `resolveAncestry` returned in `country.id`; in a GilbPlatform app that is an address under the shared world catalogue (the origin the provider takes as `geoOrigin`). The source sends the request to the same address (it takes the id as given). With the default `noAncestry`, no request is ever made. The unit makes no other request and writes nothing.

## Examples

```tsx
import { useHomeDial, type ResolveAncestry } from "@kaigilb/gilbplatformcode-home-dial";

// The host's answer to "which country is this place in" (null when it cannot say):
const resolveAncestry: ResolveAncestry = async (placeId) => ({ country: await myCountryOf(placeId) });

// As the member a phone section asks its host for (the section calls it with the holder's address claims, or [] when it has none):
const useHomeDialMember = (claims: Parameters<typeof useHomeDial>[0]) => useHomeDial(claims, resolveAncestry);
```

## What the host must supply

- `claims`: the holder's address claims. Not supplied (`[]`): nothing is prefilled.
- `resolveAncestry`: not supplied: `noAncestry`, nothing is prefilled and nothing is requested.
- A global `fetch`. Nothing else: no provider, no context, no setting.

## Module state

None. The hook keeps the answer in `useState` and a cancel flag per effect run.

## Do not

- Do not use `phone-text`'s `joinPhone` beside this one in a phone box (the false friend above).
- Do not read a request's failure as "this country has no code": both end in `""`, and the prefill is only a convenience; never save from it without the person's typing.
- Do not turn the code into a country again, and do not pick one of two codes.
- Do not add the host's address, or a list of countries, to this unit.

## Wrong readings

- "The hook prefills from any address." Only from the one labelled home, or from the only address.
- "Two calling codes: take the first." It takes neither (`""`).
- "A new `claims` array restarts the request." Only a different `uri` or different place ids do.
- "`useHomeDial` returns a `+`." It returns digits ("47"); the box adds the `+`.
- "The default host asks the catalogue." The default knows no country and asks nothing.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, split by symbol:

- `src/lib/mynet/phone/useHomeDial.ts` (77 lines), whole, to `src/useHomeDial.ts`.
- `src/lib/mynet/phone/countryCallingCode.ts` (35): `readCountryCallingCodes` (lines 21-35) to `src/countryCallingCode.ts`; `callingCodesOf` is `phone-text`'s.
- `src/lib/mynet/phone/dialCode.ts` (43): `joinPhone` (lines 20-27) to `src/dialCode.ts`; `splitPhone`, `claimLabeledHome` and `claimForPhonePrefill` are `phone-text`'s.

(The three files were themselves copied from the MyNet app.)

Named changes, and only these:

1. The imports are imports of units: `claimForPhonePrefill` from `phone-text` in `useHomeDial.ts`, `callingCodesOf` from `phone-text` in `countryCallingCode.ts`. `phone-text` is a peer; the symbols it already holds are not copied.
2. The header comments are new and shorter; the comments that name a cycle, a ruling, an agent, a date, a ticket or a MyNet commit are reworded with the same facts. No code changed.
3. `src/index.ts` is new and exports by name.

With comments and imports removed, `useHomeDial.ts` is token-equal to the source (166 words, 0 diff lines), and `joinPhone` (38 words) and `readCountryCallingCodes` (45 words) are token-equal to the source's functions. The functions taken from `phone-text` were compared with the source's too (0 diff lines for `splitPhone`, `claimLabeledHome`, `callingCodesOf`; `claimForPhonePrefill` as above; `phone-text`'s `joinPhone` is the false friend).

## Tests

72 cases in 5 files (`npx vitest run`):

- `dialCode.test.ts` 33: PORTED the source's 5 cases (`dialCode.test.ts` 3, `countryCallingCode.test.ts` 2), the functions that moved to `phone-text` now read from it; NEW `joinPhone` on 16 inputs; the two `joinPhone`s measured against each other (agree on 42 pairs, differ exactly on a `+` number with a code); `claimForPhonePrefill` against the app's written out as an oracle on 8 lists, and the throw on a hole.
- `countryCallingCode.test.ts` 6 (new): the request (GET, the address given, `Accept`, no other header, the signal), the codes read (one, two, invalid dropped, none), a refusal throws with the status, a network failure is thrown.
- `useHomeDial.test.tsx` 18 (new): no claims, the default host asks nothing, one code gives digits and one request at the country's address, two codes, no code, a refused read, the walk over place ids, an empty country id, which claim may prefill, failing host and failing request, the same address does not restart, a different address does, the claims go away, an answer after unmount, three stale-walk cases.
- `exports.test.ts` 2, `hostAgnostic.test.ts` 13.

The source had no test of `useHomeDial` itself (its two phone tests are the five cases above). No `vi.mock`; the test passes a recording `fetch` and its own `resolveAncestry`.

Mutation checks: 25 mutants (the one-code rule, the plus, the walk and its stop, the restart key, the three cancel checks, the failure answer, the empty-claims answer, the default host; the join's five steps; the request's method, header, refusal, signal and field), all killed; the first run had 3 survivors (the two cancel checks that only matter when a walk is replaced while it is running, and an empty country id that must not end the walk), tests added.
