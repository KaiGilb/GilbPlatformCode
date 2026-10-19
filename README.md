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
