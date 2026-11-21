Needs: app-shell, lws-session-bridge, signin, style-runtime, vault-share-sheet, vault-switcher

# starter-app

The one code base a new GilbPlatform app starts from: it loads the app's style, signs a person in and out, opens their own vault for the app (making it at the first sign-in), draws the frame for a wide window and a phone, and lets them share that vault.

## What this is

The one code base a new GilbPlatform app starts from: it loads the app's style, signs a person in and out, opens their own vault for the app (making it at the first sign-in), draws the frame for a wide window and a phone, and lets them share that vault.

It joins the units that do each part and holds no copy of them:

| Part | Unit | What the starter does with it |
|---|---|---|
| Style | `style-runtime` | `loadStyle` before the first render, as Dev.Guide.AppStyle says: the cached style at once, then the saved style, else the app's own `/style.tokens.json` |
| Start-up | `lws-session-bridge` | `configureLiveApp`: the platform origin, the system vault hosts, the one session credential |
| Sign in, sign out, the person's vault | `signin` | `useLiveStart` and `SignInCard`: the email code, the vault found or made once, the sign-in server told at sign-out |
| Computer and phone | `app-shell` | `ShellFrame`: a menu beside the centre on a wide window; below 840 px the centre alone, a bottom bar and the menu as a drawer |
| Which vault is open | `vault-switcher` | the chip in the header: the person's own vault and the ones shared with them |
| Share access | `vault-share-sheet` (on `vault-access`) | give view or edit access, see who has it, take it away; a person the platform gives no name is told apart by the end of their key |

Two calls and one type are the whole surface:

- `startStarter(settings, options?)`: once, at module level, before the first render. It checks the settings (and throws a sentence that names every problem), sets the origins, makes the credential, and starts the style load. It returns the `runtime`.
- `<StarterApp runtime sections words? signInNote? />`: the whole app around your sections.
- `StarterSection`: `{ id, label, render(ctx), detail?(ctx) }`. `render` fills the centre; `detail`, when given, fills the right region. `ctx` is `{ vault: { vaultId, label, yours, canWrite }, principal, actor, signal, credential, vaultRefused() }`.

Also exported: `settingsProblems(settings)` (the same check, as a list of sentences), `defaultWords` and the types.

What a person sees, in order: "Checking your sign-in…"; the sign-in card (a person with no account names their account on it); "Opening your vault: …" with the step it is at; then the frame. A start that fails shows the platform's own sentence with Try again and Sign out. Every wait and every stop says what it is.

## What this is not

- Not the app's records. The starter has none: a section is where the app lists, adds, changes and deletes its own kind of record.
- Not the App Style Studio. The app loads `style-runtime` only; choosing a style is a developer's tool.
- Not a router. The page's address says what is open so a reload opens the same place: `?section=` unless it is the first section, `?vault=` unless it is the person's own vault. A part that names a section that is not there or a vault the person cannot open is taken out once the frame is drawn. No history entry is added and no path is read.
- Not a second sign-in, vault client or share screen. Each is the unit named above; a fix belongs there.
- Not a place for a host name. Every origin, name and type comes in through the settings.

## How to take it

A new app takes the starter as a whole app, with one command, from a clone of this library:

```sh
node <path-to-the-library>/apps/starter-app/scripts/take.mjs <new-app-folder> --id myapp --name "My App" --port <your own dev port>
cd <new-app-folder>
npm install
npm test
npm run dev:fake
```

`apps/starter-app` is that app: its settings file, its default style file, the place for its record screens, a fake-platform mode and its tests. Its README says what to set and where to add your records. The command copies it, renames it and points its units at the library.

To add the starter to an app you already have, install the unit and its peers. Put `install-links=true` in the app's own `.npmrc`, then run the line `node scripts/peers.mjs starter-app` prints (19 units, in install order).

Package: `@kaigilb/gilbplatformcode-starter-app`. It ships TypeScript source and one stylesheet, `starterApp.css`, which the component imports itself (with `signin.css`).

In the GilbApp chat, a project folder the chat made already has the `.npmrc` line. A coding agent may not write `.npmrc`; when the line is missing it passes `--install-links` to every `npm install` and `npm ci`.

### Styling

- **System:** the `style-runtime` variables (0.2.x), written by `loadStyle`. The starter's own parts use `sa-*` class names over `--accent`, `--paper`, `--ink`, `--surface`, `--lines`, `--accent-ink`, `--on-accent`, `--r-md`, `--r-lg`, `--sans`, `--gs-font-size` and the `--gs-button-*` set.
- **The frame needs Tailwind v4.** `app-shell`, `panes` and `drawer` draw with Tailwind utility classes. The app runs `@tailwindcss/vite` and adds the installed units to the scan: `@source "../node_modules/@kaigilb/*/src/**/*.{ts,tsx}";` (see `apps/starter-app/styles/app.css`).
- **Variables the frame reads that `style-runtime` does not write** (`--paper-2`, `--ink-soft`, `--ink-faint`, `--ink-ghost`, `--line`, `--line-2`, `--sel`, `--focus`): `starterApp.css` mixes them from the style's own colours, so they follow the style and its dark mode. Do not also load `editorial-tokens`.
- **Before the style has loaded** the sheet's `:where(:root)` values show (the default style). Any loaded style replaces them.
- **Contrast.** Every text colour the sheet decides reads at 4.5:1 or better (WCAG 2.1 AA) on its background, in the default style, light and dark, and before a style has loaded: `src/contrast.test.ts` works each pair out from the sheets' own text (this one, the sign-in card's and the share sheet's), and then works every pair out again for 288 styles of four shapes as `style-runtime` writes them, in both looks. `--ink-soft` is 80% ink and `--ink-faint` 70% ink on paper; the open section in the menu and the frame's open bottom-bar button are written in `--ink` on the `--sel` tint (the accent as text on that tint does not reach 4.5:1). Two things no sheet can mend, because they are the style's own colours: the label on the accent (the sign-in button and the two Share buttons, `--on-accent` on `--accent`), where the runtime picks white or near-black and for an accent of middling brightness neither quite reaches 4.5:1 (the test lets that one pair go down to 4.3:1); and a style file that itself gives a `bad` or an `ink` that does not read on its own paper. The muted colours are mixes of the ink and the paper, so they need an ink that stands well off its paper; all 288 styles of the test hold. After you choose another style, run the app's browser proof: it measures every text of every screen as drawn, in both looks.
- **Placeholders.** The sheet sets `::placeholder { color: var(--ink-faint); opacity: 1; }` for every field of the app, your record screens included. A placeholder is text, and a CSS reset draws it at half the text colour. Measured in Chrome on 2026-11-21 with the default style: 5.70:1 to 5.95:1 light and 7.36:1 to 7.93:1 dark (without the rule 3.13:1 to 3.15:1 light and 4.48:1 dark). A rule of your own for `::placeholder`, after this sheet, replaces it.
- **The share sheet.** The sheet sets one variable of the `vault-share-sheet` unit (0.1.3 and later): `--vss-on-danger: var(--on-bad)`, the label of the red button that answers "Remove …?". Without it that label takes the colour made for the accent. Measured in Chrome on 2026-11-21: 6.37:1 light and 8.10:1 dark with the default style (without the variable 2.33:1 dark), and 6.37:1 light with a yellow accent (without it 2.96:1).
- **The sign-in card.** The sheet sets three variables of the `signin` unit (0.2.14 and later), so that the card reads in a dark look and with any style: `--signin-link: var(--accent-ink)` for the Change email link, `--signin-error-text: var(--bad)` for the sentence that refuses a vault name, and `--signin-card: var(--paper)`, which stands the card on the paper and not on the surface. The style runtime brings `--accent-ink`, and the `--bad` it works out itself, to 4.5:1 against the paper of each look; against the surface only when the style gives one (a dark style with no surface of its own drew the link at 4.05:1 on the card's surface). On the paper both hold for every style the runtime writes: `src/contrast.test.ts` sweeps 288 styles of four shapes in both looks. Measured in Chrome on 2026-11-21 with the default style, light and dark: the link 4.60:1 and 4.85:1, the sentence 5.83:1 and 8.22:1, the new vault's address 15.99:1 and 7.55:1. The one thing a sheet can still break: a style file that itself gives a `bad` or an `ink` that does not read on its own paper, which the runtime passes through as given.
- **Themes:** light and dark, from the style sheet (`mode` `system` follows the device).
- **Build settings:** Vite compiles the units' TSX with the automatic JSX runtime: `esbuild: { jsx: "automatic" }` and `optimizeDeps: { esbuildOptions: { jsx: "automatic" } }`. TypeScript 5.7 or later with `strict`.
- The page must give the app its full height (`html, body, #root { height: 100% }`).

### The origins

| Setting | The server it must address | GilbPlatform production | Why |
|---|---|---|---|
| `platformOrigin` | the platform's apex | `https://gilb.com` | only the apex marks the landing vault and reaches each vault at its own host |
| `idOrigin` | the identity host | `https://id.gilb.com` | codes, accounts, the vault list and making a vault live there |
| `systemVaultHosts` | bare host names of the platform's own vaults | `id.gilb.com`, `veda.gilb.com`, `geo.gilb.com`, `kaizen.gilb.com`, `connect.gilb.com`, `maintain.gilb.com` | the credential rule reads them |
| `styleSheetUrl` | the app's saved style sheet, in the app's own vault | the address the App Style Studio shows after Save | read with plain GET calls, no sign-in |

Each vault call is signed for the vault's own host; the units do that. A local app on any free localhost port except 5197 and 5251 signs in to production with no setup and no cookie.

## Examples

```tsx
import { createRoot } from "react-dom/client";
import { StarterApp, startStarter, type StarterSection } from "@kaigilb/gilbplatformcode-starter-app";

const runtime = startStarter({
  appId: "plants",                       // storage prefix
  appName: "Plant Diary",                // sign-in card, header, sign-in email
  platformOrigin: "https://gilb.com",
  idOrigin: "https://id.gilb.com",
  systemVaultHosts: ["id.gilb.com", "veda.gilb.com", "geo.gilb.com", "kaizen.gilb.com", "connect.gilb.com", "maintain.gilb.com"],
  vaultType: PLANT_DIARY_TYPE,           // the GilbVeda type each person's vault represents (from Agent.Concept)
  vaultNameSuffix: "plants",             // Ann's vault is named annplants
});

const sections: StarterSection[] = [
  { id: "plants", label: "Plants", render: (ctx) => <PlantList vaultId={ctx.vault.vaultId} canWrite={ctx.vault.canWrite} signal={ctx.signal} /> },
];

createRoot(document.getElementById("root")!).render(<StarterApp runtime={runtime} sections={sections} />);
```

## What the host must supply

- The settings: `appId`, `appName`, `platformOrigin`, `idOrigin`, `vaultType`, `vaultNameSuffix`; optionally `systemVaultHosts`, `localRigHosts`, `styleSheetUrl`, `styleFallbackUrl`.
- `vaultType`: the full address of a live GilbVeda type that says what one person's vault in the app stands for. The platform refuses a vault without one, and accepts any address that resolves, so it does not catch a wrong one. Agent.Concept gives it, before the first live sign-in; until then only the app's fake mode runs. Do not invent one and do not borrow a note type, a person's or an app's own vault type, or another app's type that means something else.
- At least one section, in a stable array.
- A `style.tokens.json` in the app's public folder (the fallback), Tailwind as above, and a full-height page.
- In every section: pass `ctx.signal` to each read and start none after it aborts; write only when `ctx.vault.canWrite`; name `ctx.vault.vaultId` as the vault of every record call (never a default vault); call `ctx.vaultRefused()` when the platform answers 403 for the open vault.

## Do not

- Do not call `startStarter` in a component or twice. It sets the origins and the credential for the whole page.
- Do not wait for `runtime.style` before the first render. The cached style is already applied when `startStarter` returns.
- Do not make a second `SessionCredential`, call `setBaseOrigin` or `setLwsAuth` yourself, or add a second `<style id="gilb-style">`.
- Do not put the fake platform in a build. `apps/starter-app` loads it only in its fake mode and its build check refuses it.
- Do not keep a record, a label or a choice in the browser as its only copy. Everything the app saves goes to the open vault. The starter itself keeps nothing of a person's on the device but what the list under "What it keeps in the browser" names.
- Do not pass `rememberNames` to the share sheet from a section of your own: it keeps the name a person typed on that device only.
- Do not give two apps on one origin the same `appId`: the frame's layout, the style cache and the remembered vault are kept under it.

## Wrong readings

- "The first sign-in of a person with no account fails." It does not: the sign-in card asks them to name their account, the platform makes it, and the app's vault is made after it.
- "A vault shared with me becomes my own vault." It does not. The person's own vault is found by their own name plus `vaultNameSuffix`; a shared vault of the same type is offered in the chip.
- "Share is hidden in a vault I do not own." It is shown; the sheet then says the person does not hold Control and offers no form. The platform decides who holds Control.
- "The chip shows a vault as soon as it is shared." It lists again each time it is opened, and at each sign-in. It does not poll.
- "`style: none` is a crash." It means no style file was found; the default values in `starterApp.css` show.
- "On a phone the header has Share and Sign out." Below 600 px they are in the menu drawer (the Menu button in the bottom bar); the header keeps the name and the chip.
- "The share list shows the name I typed." It shows what the platform says about the person. A person the platform sends no name for reads what their key is and the end of the key, for example "Registered principal, key ending tbh8g4", with "No name was given for this person." under it. The key ending is what tells two such people apart, and it reads the same after a reload and on another device; it does not say who the person is. Only the platform can: the access list it answers carries `label` and `webId`, and where both are empty there is no name to show. The starter does not keep the typed name on the device.
- "The key ending is always 6 characters." It is 6, or as many more as it takes for no two rows of the list to share it.
- "Typing in a section is lost when the menu or Share opens." It is kept. On a phone the menu drawer closes after a pick without the frame being drawn again (the starter sends the Escape the drawer closes on; `app-shell` has no call to close it). Opening another section or another vault does start afresh.
- "Reloading signs the person out." On a page with IndexedDB the sign-in is kept for up to 14 days from last use; `signin` owns that.

## What it keeps in the browser

For the test that drops each one and reloads:

| Where | Key | Whose | After it is dropped |
|---|---|---|---|
| IndexedDB | `gilb-signin-session` | `signin` | the person signs in again |
| localStorage | `<appId>:own:<principal>`, `<appId>:last:<principal>`, `<appId>:pending:<principal>` | `signin` | the person's vault is found again by its name; a half-made vault's name is asked of the platform again |
| localStorage or sessionStorage | `<appId>.pendingSignInEmail` (15 minutes) | `signin` | the email is typed again |
| localStorage | `style:<appId>` | `style-runtime` | the style is read again from the saved sheet or the app's own file |
| localStorage | `<appId>.shell.layout.v1` | `app-shell` | the frame's default widths: a per-browser layout, not a record |

Nothing else. The open vault and section are in the address. A test pins the localStorage and sessionStorage keys after a sign-in, a section pick and a share.

## Where it came from

New code, written for this repository on 2026-11-21 so that a new project's first version starts from one ready app. Repository `KaiGilb/GilbPlatformCode`, base commit `df1cb9e80eb1bffedf813b1a4459f77135f5e8b0`. No product code was copied: every part is a call into the unit named in the table above. Copied from `vault-share-sheet`, as every unit carries its own: `scripts/check-host-agnostic.mjs` (with this unit's list of allowed imports) and `src/hostAgnostic.test.ts`.

## Tests

`npm test` runs `StarterApp.test.tsx` (jsdom, against `fake-platform`: the real sign-in, create-vault, vault list, grant, revoke and sign-out calls, with an axe-core check of each screen), `accessList.test.ts` (rows told apart), `contrast.test.ts` (text contrast, placeholders and the share sheet's buttons included, from the style sheets' own text, for the default style and for 288 others), `start.test.ts` (the settings check, the origins and the style load, the saved style included) and `hostAgnostic.test.ts`. `npm run typecheck` and `npm run check:host-agnostic` are the other two proofs. Colour contrast as drawn is measured by the browser proof of `apps/starter-app`: every text of every screen the fake mode reaches, in both looks and at both sizes.
