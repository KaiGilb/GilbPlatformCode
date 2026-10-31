# social-logo

Draws the logo and name of the social platform an online account belongs to.

## What this is

Draws the logo and name of the social platform an online account belongs to.

A Social row (an online account: a web address the holder keeps for a person) shows a small logo in front of the platform's name. The logos are local data: no icon font, no image file, no network call, 18 px, in the surrounding text colour.

- `SocialLogo({ platform, className? })`: the logo as one inline `<svg role="img">` named "<Platform> logo". `platform` is the platform's name as the online-account reader returns it, or `null`. An unknown name, and `null`, draw a plain globe named "Web address logo" (it stands for a site that is not a known platform, or a row not yet filled in). The element carries `data-social-logo="<Platform>"` (`"web"` for the globe). `className` is added after the fixed classes (`inline-block size-[18px] shrink-0`).
- `SOCIAL_LOGOS`: the table, 35 platforms by exact name. Three kinds of shape: 26 icon-font **glyphs** (path data in font coordinates, y up, drawn flipped), one **mark** (X, on the 24-unit grid), 8 **monogram** badges (an outlined rounded square with the platform's initials: TikTok, Threads, Bluesky, Discord, Substack, ResearchGate, ORCID, Mastodon). `SocialLogoShape` is the type of an entry.
- `socialPlatformName(platformOfValue, label)`: the name of the platform a row is about: the platform the address says, else the stored label (trimmed) when it names a platform in the table, else `null`.

How the logos are held: **inlined SVG path data in `src/socialLogos.ts`**, kept exactly as the source has it (a digest of the whole table is pinned in a test). No logo is a file or a URL, and no platform address is in this unit; the keys are platform names, not hosts.

## What this is not

- Not the reader that turns a web address into a platform name (`platformOf`); that is `contact-rows`. The table must hold every name it can return; it does today (35 and 35, compared when this unit was cut). A test here names the 35.
- Not the Social row, its label or its link.
- Not the platforms' own brand assets. Eight platforms have only a monogram badge, not an invented logo; replace one with the platform's own mark only when its brand asset is licensed in.

## How to take it

Package: `@kaigilb/gilbplatformcode-social-logo`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/social-logo` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/social-logo
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/social-logo/src";` (the size class `size-[18px]` must be generated). The logo takes its colour from the text colour around it (`currentColor`); the call site passes the colour class its app uses for a row's sub-label. The unit reads no CSS variable.

## Requests and their servers

None. Nothing is fetched: the logos are in the bundle.

## Examples

```tsx
import { SocialLogo, socialPlatformName } from "@kaigilb/gilbplatformcode-social-logo";

// `platformOfAddress` is your reader of a web address's platform name (null when unknown)
function SocialLabel({ address, label }: { address: string; label: string }) {
  const platform = socialPlatformName(platformOfAddress(address), label);
  return (
    <span className="flex items-center gap-1.5 text-[var(--ink-faint)]">
      <SocialLogo platform={platform} />
      {platform ?? label}
    </span>
  );
}
```

## What the host must supply

- Tailwind scanning this unit's `src` (above).
- Nothing else: no provider, no context, no setting, no state.

## Module state

None.

## Do not

- Do not draw a logo from a file or a URL, and do not add a platform's address to the table.
- Do not invent a logo for a platform that has none here; use the monogram badge.
- Do not flip a mark: glyphs are drawn flipped because their coordinates are the icon font's (y up); the X mark is on the usual top-left grid.

## Wrong readings

- "`SOCIAL_LOGOS[name]` is `undefined` for a name that is not a platform." For an ordinary name yes. As in the source, the table is a plain object, so a name that is an inherited property of objects (`constructor`, `toString`) finds a value that is not a shape: the component then draws the globe but names it by the given name and marks it with that name; `socialPlatformName(null, "constructor")` returns `"constructor"`. Left as the source has it (no real platform has such a name); a test pins it so it is visible.
- "The logo's name is always the platform." The name falls back to "Web address" for a name not in the table.
- "`socialPlatformName` checks that the address's platform is in the table." It does not: the address's own name wins as given; the logo then draws the globe.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, whole files:

- `src/components/mynet/SocialLogo.tsx` (48 lines) to `src/SocialLogo.tsx`.
- `src/lib/base/socialLogos.ts` (73) to `src/socialLogos.ts`.

(The component and the table were themselves copied from the MyNet app; the glyph paths are Font Awesome 4.7 brand glyphs, SIL OFL 1.1, Copyright Dave Gandy 2016; the X mark is in the style of the simple-icons collection, CC0. The marks are the platforms' trademarks, shown only to name the platform.)

Named changes, and only these:

1. `SocialLogo.tsx` imports `./socialLogos` (the source imports it from the app's `lib/base`).
2. The header comments of both files are new and shorter; the comments that name a cycle, a ruling, an agent, a date, a ticket or a session are reworded with the same facts (the licence notes are kept). No code changed. (The source's comment said "26 platforms" of glyphs; the table has 26 glyphs and the new comment says 26.)
3. `src/index.ts` is new and exports by name.

With comments and imports removed, `SocialLogo.tsx` is token-equal to the source (155 words, 0 diff lines) and `socialLogos.ts` is token-equal (2869 words, 0 diff lines).

## Tests

44 cases in 3 files (`npx vitest run`):

- `SocialLogo.test.tsx` 29: PORTED the source's "platform logos" block (5 cases: every platform has a logo, no orphan logo, each logo draws as a named 18 px image with no external reference, an unknown platform and none draw the globe, the logo's platform name). The first two read the platform names from the online-account reader (`contact-rows`); here the 35 names are written out in the test (and were compared with the reader's when the unit was cut), so this unit's proof does not install the section's whole closure. NEW: what each kind draws (glyph flipped in its viewBox; the X mark on the grid and not flipped; each monogram's initials, outline and no path; the globe's circle, ellipse, line and strokes), the class order, no request while drawing all 36 states, `socialPlatformName` edge cases, the badge and globe geometry, the X path, a digest of the whole table (taken from the source), and the kept quirk below.
- `exports.test.ts` 2, `hostAgnostic.test.ts` 13 (the same host-agnostic check test as the other units; it writes to the OS temp directory).

No `vi.mock`.

Mutation checks: 22 mutants of the two files (name and size, flip, kind branch, badge and globe geometry, the data attribute, the class join, the name reader's three steps, table entries), all killed; the first run had 5 survivors (badge stroke width and text anchor, globe radius and ellipse, an X path edit), each a gap in what the tests pinned; geometry tests and the table digest were added.
