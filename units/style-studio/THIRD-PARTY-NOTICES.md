# Third-party notices

This unit (`style-studio`) and the unit it depends on (`style-runtime`) include or use the following. Only `style-runtime` reaches an app at run time; everything else here belongs to the developer tool.

## Tailwind CSS (MIT)
Copyright (c) Tailwind Labs, Inc. The "popping" catalogue (`src/catalogue/pop.ts`) is composed from Tailwind CSS v3 default colour values.

## Open Color (MIT)
Copyright (c) heeyeun. The "classic" catalogue (`src/catalogue/classic.ts`) is composed from Open Color values.

## culori (MIT)
Copyright (c) Dan Burzo. Used for colour parsing and conversion, in `style-runtime` (runtime dependency).

## DOMPurify (MPL-2.0 OR Apache-2.0)
Copyright (c) Cure53 and contributors. Used to clean an uploaded SVG logo (`src/studio/logo.ts`). Dual-licensed; we use it under the Apache License 2.0.

## Dictionary of Colour Combinations data (MIT)
Copyright (c) 2020 Matt DesLauriers, https://github.com/mattdesl/dictionary-of-colour-combinations. Source of
`src/catalogue/wada.generated.ts` (generated from `vendor/wada/colors.json`; the licence text is `LICENSE.md` in this unit).
The data follows Sanzo Wada, *A Dictionary of Color Combinations* (1933-34). The set is on by default; see README.

## Bundled fonts (SIL Open Font License 1.1, via @fontsource)
Each font is installed as an `@fontsource/<name>` package (latin subset, weights 400 and 600 only) and loaded lazily. Licence is the
`license` field of each package's package.json; the font files and licence texts are in the package folders under node_modules.

| Font | Category | Licence |
| --- | --- | --- |
| Inter | sans | OFL-1.1 |
| Manrope | sans | OFL-1.1 |
| DM Sans | sans | OFL-1.1 |
| Plus Jakarta Sans | sans | OFL-1.1 |
| IBM Plex Sans | sans | OFL-1.1 |
| Work Sans | sans | OFL-1.1 |
| Outfit | sans | OFL-1.1 |
| Figtree | sans | OFL-1.1 |
| Nunito Sans | sans | OFL-1.1 |
| Rubik | sans | OFL-1.1 |
| Space Grotesk | sans | OFL-1.1 |
| Sora | sans | OFL-1.1 |
| Urbanist | sans | OFL-1.1 |
| Lexend | sans | OFL-1.1 |
| Public Sans | sans | OFL-1.1 |
| Source Sans 3 | sans | OFL-1.1 |
| Source Serif 4 | serif | OFL-1.1 |
| Fraunces | serif | OFL-1.1 |
| Lora | serif | OFL-1.1 |
| Merriweather | serif | OFL-1.1 |
| Playfair Display | serif | OFL-1.1 |
| Libre Baskerville | serif | OFL-1.1 |
| EB Garamond | serif | OFL-1.1 |
| Crimson Pro | serif | OFL-1.1 |
| Cormorant Garamond | serif | OFL-1.1 |
| Newsreader | serif | OFL-1.1 |
| Spectral | serif | OFL-1.1 |
| DM Serif Display | serif | OFL-1.1 |
| Instrument Serif | serif | OFL-1.1 |
| Bricolage Grotesque | display | OFL-1.1 |
| Syne | display | OFL-1.1 |
| Unbounded | display | OFL-1.1 |
| Archivo Black | display | OFL-1.1 |
| Bebas Neue | display | OFL-1.1 |
| Righteous | display | OFL-1.1 |
| Abril Fatface | display | OFL-1.1 |
| Anton | display | OFL-1.1 |
| Climate Crisis | display | OFL-1.1 |
| JetBrains Mono | mono | OFL-1.1 |
| IBM Plex Mono | mono | OFL-1.1 |
| Fira Code | mono | OFL-1.1 |
| Space Mono | mono | OFL-1.1 |
| Source Code Pro | mono | OFL-1.1 |
| Roboto Mono | mono | OFL-1.1 |
| Caveat | handwriting | OFL-1.1 |
| Kalam | handwriting | OFL-1.1 |
| Patrick Hand | handwriting | OFL-1.1 |
| Shadows Into Light | handwriting | OFL-1.1 |
