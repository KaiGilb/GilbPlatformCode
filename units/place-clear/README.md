# place-clear

Clears place rungs on a draft the person is still editing. It does not save, and it does not decide who can see the address.

## What this is

A place draft has three rungs: `city`, `region`, and `country`. Each can be filled by the person or by a cascade. A divergence notice says the row landed on a different rung from the box they typed in. The notice is draft-only. It is not stored.

`clearFinerOnCountryChange` runs when the country changes. It sets city and region to null, and sets their cascaded flags to false. Country is not cleared, including a country the cascade filled. A notice is dropped unless it describes `country`. A notice about a city or a region would be describing something that has just been cleared.

`clearRung` clears one rung and sets that rung's cascaded flag to false. The notice is dropped only when its `rung` is exactly that rung.

Both return a new draft. The draft you passed is not changed. `place` and `cascaded` are new objects. A notice that is kept is the same object. Every other field, including the label, the street, and whatever access fields the app keeps, is copied through untouched. This unit does not read them.

## What this is not

- Not the cascade that fills a country from a city. That walk loads ancestry. It stays in the app.
- Not the default access, and not the list of who can see a field. Those stay in the app. Do not copy them in beside this.
- Not a search of places, and not a save.
- Not a trim of the label. A label with a leading space stays that way.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-clear`

```ts
import { clearFinerOnCountryChange, clearRung } from "@kaigilb/gilbplatformcode-place-clear";
```

Path: `units/place-clear/`.

## What you pass

A draft with at least:

| Field | Meaning |
|---|---|
| `place.city`, `place.region`, `place.country` | The picked row, or null. Extra keys on `place` are kept. |
| `cascaded.city`, `cascaded.region`, `cascaded.country` | True when the cascade filled that rung. |
| `divergence` | Null, or an object with `rung`. Other keys on the notice are kept when the notice is kept. |

`clearRung` also takes `"city"`, `"region"`, or `"country"`.

The functions are generic. Extra fields on the draft come back on the result. The return is the same draft shape you passed.

## What you get

The next draft.

`clearFinerOnCountryChange`:

- `place.city` and `place.region` are null.
- `cascaded.city` and `cascaded.region` are false.
- `place.country` and `cascaded.country` are unchanged.
- `divergence` is null when it was null, or when `rung` is anything other than the exact string `country`. `"Country"` is dropped. A country notice is kept.

`clearRung`:

- That rung's place is null and its cascaded flag is false.
- The other rungs are unchanged.
- The notice is dropped only when `divergence.rung === rung`.

## Examples

```ts
clearFinerOnCountryChange({
  label: " home ",
  place: { city: oslo, region: osloRegion, country: norway },
  cascaded: { city: true, region: true, country: false },
  divergence: { rung: "city", label: "Oslo" },
});
// city and region null, country still norway, cascaded country still false,
// divergence null, label still " home "

clearRung(draft, "region");
// region null, city and country untouched
// a notice whose rung is "region" is dropped
// a notice whose rung is "city" is kept
```

## What the host must supply

The draft. The cascade that fills rungs. The access rung on each field. This unit will not invent a private default, and it will not clear country when the country changes.

## Do not

- Do not clear country inside `clearFinerOnCountryChange`. The country is the thing that just changed. The finer rungs are what went stale.
- Do not keep a city notice after the city has been cleared.
- Do not lowercase `rung` before comparing. The three names are lower-case. A different case is a different notice, and the country-change clear drops it.

## Wrong readings

- "Changing country clears the whole place." It clears city and region only.
- "A cascaded country is stale too." It is not cleared here.
- "The notice is stored with the address." It is not. The app drops it before the write. This unit only decides whether the draft still shows it.
- "This chooses who can see the city." It does not read access at all.

## Where it came from

MyNetBase `clearFinerOnCountryChange` and `clearRung` in `src/components/profile/PlaceClaimsCard.tsx`. The access defaults next to them in that file are not part of this unit.
