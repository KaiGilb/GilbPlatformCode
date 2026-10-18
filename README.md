# GilbPlatformCode

Grab home for reusable GilbPlatformCode units.

This repository is the **code home** (clone or package-install). It is **not** the search. Search References in the App Builder vault (`https://gilb.com/app/?section=standards&pod=https%3A%2F%2Fappbuilder.gilb.com%2Fbase&stab=references`). If a reference document matches, take the folder and commit its exhibit names from here. If none matches, stop. Do not search GitHub to learn that none exists.

Clone and package-install are both valid take paths; neither is exclusive.

Clone: `git clone https://github.com/KaiGilb/GilbPlatformCode.git`

## Two folders, two libraries

- **`units/`: app code.** React and TypeScript units for apps on GilbPlatform (the GilbApp and GilbPlatform tracks). Their reference documents are in the **GilbPlatformCode Library** group on appbuilder.
- **`web-units/`: website code.** Vue 3 and Nuxt 3 units for websites (Agent.Website, the website starter `website-engine-a`). Their reference documents go in the **GilbWebsiteCode Library** group on appbuilder, not in the app library (that group is still to be created: handoff 2026-10-18 §4, held for Kai's go).

The two never share a folder. A unit that exists for both (the section menu: `units/section-menu` and `web-units/section-menu`) is two units with the same behaviour, one per folder, each with its own reference document. A website takes a web unit with pnpm straight from this repository at a commit: `git+https://github.com/KaiGilb/GilbPlatformCode.git#<commit>&path:/web-units/<unit>`.
