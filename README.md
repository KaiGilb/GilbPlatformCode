# GilbPlatformCode

Grab home for reusable GilbPlatformCode units.

This repository is the **code home** (clone or package-install). It is **not** the search. Search References in the App Builder vault (`https://gilb.com/app/?section=standards&pod=https%3A%2F%2Fappbuilder.gilb.com%2Fbase&stab=references`). If a reference document matches, take the folder and commit its exhibit names from here. If none matches, stop. Do not search GitHub to learn that none exists.

Clone and package-install are both valid take paths; neither is exclusive.

Clone: `git clone https://github.com/KaiGilb/GilbPlatformCode.git`

## Two folders, two libraries

- **`units/`: app code.** React and TypeScript units for apps on GilbPlatform (the GilbApp and GilbPlatform tracks). Their reference documents are in the **GilbPlatformCode Library** group on appbuilder.
- **`web-units/`: website code.** Vue 3 and Nuxt 3 units for websites (Agent.Website, the website starter `website-engine-a`). Their reference documents are in the **GilbWebsiteCode Library** group on appbuilder, not in the app library.

The two never share a folder. A unit that exists for both (the section menu: `units/section-menu` and `web-units/section-menu`) is two units with the same behaviour, one per folder, each with its own reference document (`t:SectionMenu.app`, `t:SectionMenu.web`). A website takes a web unit as a copy, the same way an app takes a unit: pack the unit from a clone at a commit (`npm pack`) and keep the packed file in the site's repository (see the unit's README, "How to take it"). ⛔ Not by a pnpm git URL with `&path:`: its lockfile loses the path, and an install into an empty store gets the whole repository. Under pnpm 11 the site's `pnpm-workspace.yaml` must also exclude the packed unit from `minimumReleaseAge`; prove a take with an install into an empty store (the unit's README says how).

The web units: `section-menu` (the header menu), and the website starter's ten building blocks, moved here from its `components/catalog/` and `components/ContactForm.vue`: `hero`, `feature-grid`, `testimonial`, `pricing`, `faq`, `cta-section`, `blog-post-card`, `image-gallery`, `newsletter-signup` and `contact-form`. Every one of the ten reads one set of theme variables, `--site-block-*`, so a site maps its tokens once (each unit's README, "Host must supply").

## Install order

A unit's library peers must be installed before it; `scripts/peers.mjs` works out that order from the `package.json` files and prints the `npm install` line.

```
node scripts/peers.mjs <unit>
```

## Proof

`scripts/proof.mjs` runs a unit's proofs (`npm ci`, `npm test`, then `typecheck` and `check:host-agnostic` when the unit has them) and says PASS or where it failed.

```
node scripts/proof.mjs <unit>
```

## Unit manifest

`unit.json` sits in each unit that was copied from the app and records where it came from. `node scripts/manifest.mjs check` tests every one against the unit's README and `package.json` (`node scripts/manifest.mjs list` counts them; exit `0` pass, `1` fail, `2` bad input).

```json
{
  "schema": 1,
  "unit": "units/type-key",
  "package": "@kaigilb/gilbplatformcode-type-key",
  "version": "0.1.0",
  "purpose": "The first sentence of the README's \"What this is\".",
  "source": {
    "repo": "KaiGilb/GilbApp",
    "commit": "8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd",
    "files": [{ "path": "src/lib/base/planLinks.ts", "lines": [28, 31], "to": "src/typeKey.ts" }]
  },
  "namedChanges": ["a change, in the README's words"],
  "newFiles": ["src/index.ts"],
  "host": [{ "member": "tagUsed", "replaces": "src/components/records/PlanTagLinks.tsx:98" }],
  "library": { "admitted": true, "tag": "t:ScreenButton.row", "title": "Button row (Mac order)", "note": "Only lays out buttons." }
}
```

`lines` is `[from, to]` (1-based, inclusive) or `null` for a file copied whole; `to` is the unit file the lines went into, or `null`. `library` is `{ "admitted": false }` for a unit not in the library. Peers are not here: they are in `package.json`, and `peers.mjs` reads them.

## Drift

Which units' source ranges changed in the app since the unit was copied.

```sh
node scripts/drift.mjs --app-repo <path> --to <sha> [<unit> ...]   # default: every unit with a unit.json
node scripts/drift.mjs ... --json
node scripts/drift.mjs ... --fail-on-drift                         # exit 1 when a unit drifted
```

It reads each source file at the unit's `source.commit` and at `--to` with `git show` (read only) and reports each unit as `unchanged` or `drifted`; it never prints a source line. Exit `0` means it ran, `1` only with `--fail-on-drift`, `2` when it could not run. It needs a local clone of the private app repo; CI does not run it.
