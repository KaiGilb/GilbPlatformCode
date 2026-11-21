# starter-app

The first code of a new GilbPlatform app. It runs on a computer and on a phone, loads its style, signs a person in and out, sets up a vault for each new person's records, and lets them share that vault. It has no records of its own: you add yours.

Everything it does is the `starter-app` unit (`units/starter-app` of the GilbPlatformCode library) and the units that one joins. This folder adds only the app's own settings, its default style file, the place for its record screens, a fake-platform mode and its tests.

## Take it for a new app

You need Node 22 or later and a clone of the library:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
node GilbPlatformCode/apps/starter-app/scripts/take.mjs my-app --id myapp --name "My App" --port <your own dev port>
cd my-app
npm install
npm test
npm run dev:fake
```

`take.mjs` copies this folder to `my-app` (which must not exist yet and must be outside the library), and renames it:

| It sets | Where | From |
|---|---|---|
| the app's short id | `appId` in `src/settings.ts`, `name` in `package.json` | `--id` (lower-case letters, digits, hyphens) |
| the app's name | `appName` in `src/settings.ts`, `<title>` in `index.html` | `--name` |
| the vault name suffix | `vaultNameSuffix` in `src/settings.ts` | `--suffix`, else the id without hyphens |
| the dev port | `vite.config.ts`, `scripts/browser-proof.mjs` | `--port`; without it the starter's 5262 is kept, and you change it yourself |
| where the units are installed from | every `file:` line in `package.json` | the library clone the script was run from |

The units are installed as copies from that clone (`install-links=true` in `.npmrc`, which is copied). Keep the clone where it is, or change the `file:` paths. Never use port 5197 or 5251: they are Gilb's own.

## What you still set by hand

1. **`vaultType` in `src/settings.ts`.** The full address of the GilbVeda type each person's vault for your app represents. Agent.Concept gives a new app its type. Until it is set, `npm run dev` shows a set-up page and the app makes no vault. Do not invent a type and do not borrow a note type.
2. **`styleSheetUrl` in `src/settings.ts`**, when you have chosen a style in the App Style Studio: the address it shows after Save. Until then `public/style.tokens.json` (the platform's default style) is the app's style; you may edit that file.
3. **`public/icon.svg`**, the page icon.

## Run it

| Command | What it runs |
|---|---|
| `npm run dev:fake` | The app against a fake platform that lives in the page. Nothing leaves the page and nothing is kept between loads. Sign in as `ann@example.test` or `ben@example.test` with the code `000000`. |
| `npm run dev` | The app against GilbPlatform production (`https://gilb.com`, sign-in at `https://id.gilb.com`), from `http://localhost:<your port>`. A local app needs no registration. You sign in with your email and the code sent to it. The first sign-in makes your vault for the app. |
| `npm run build` | Type check, build into `dist/`, then a check that the build does not hold the fake platform. |

A test rig sets `VITE_PLATFORM_ORIGIN` and `VITE_ID_ORIGIN` in its environment instead of the two production origins.

Open the fake mode on a phone-sized window (or your browser's device toolbar) to see the phone layout: below 840 px the menu is a drawer behind the Menu button; below 600 px Share and Sign out are in that drawer.

## Run its tests

```sh
npm test            # 3 files: the app on the fake platform, the placeholder screen, the take script (not copied into a new app)
npm run typecheck
npm run build
```

`npm test` signs two people in on the fake platform, makes each their vault, shares one vault with the other person and opens it, and signs out. No test reaches a real server.

For a real browser, start `npm run dev:fake` in one terminal, then in another:

```sh
npm run proof:browser -- <folder-for-screenshots>
```

It drives headless Chrome at 1280 x 800 and at 390 x 844 through sign-in, a failed start and Try again, the share sheet, a second person opening the shared vault, and sign-out. It writes a screenshot per step and `errors.txt` (the console errors) per size, and exits 1 on any failed step or console error.

## Add your records

The starter has no records. A new app adds its screens for one kind of record in two places:

1. **`src/records/`**: your screens to list, add, change and delete the record. Replace `RecordsHome.tsx` (and delete `test/recordsHome.test.tsx`).
2. **`src/sections.tsx`**: one line per section, for example `{ id: "plants", label: "Plants", render: (ctx) => <PlantList ctx={ctx} /> }`. A section with `detail: (ctx) => ...` also gets the right region, for one record's detail.

Each section gets `ctx`:

- `ctx.vault.vaultId`: the open vault. Name it as the vault of every record call. `ctx.vault.canWrite` false means view only: offer no add, change or delete.
- `ctx.actor`: the person's own address, the source of what they save.
- `ctx.signal`: pass it to every read, and start none once it has aborted (sign-out started).
- `ctx.vaultRefused()`: call it when the platform answers 403 for the open vault.

Before you write code that saves a record, get its GilbVeda type and field terms from Agent.Concept. Then take the record units from the library: `t:VaultRecord.client` (read, create, change and end one record; pass `{ idempotencyKey }` on a create that may be retried), `t:VaultRecord.sync` (the list and what changed) and `t:VaultSelfCard.find` (the person's own card). The origins and the credential are already set: do not call `setBaseOrigin` or `setLwsAuth` again, and do not make a second credential.

## What is in this folder

| File | What it is |
|---|---|
| `src/settings.ts` | every name, origin and type of the app |
| `src/sections.tsx`, `src/records/` | the app's sections and its record screens |
| `src/App.tsx`, `src/main.tsx` | the start: settings check, style and credential before the first render, then the app |
| `src/fake.tsx` | the fake mode; loaded only by `vite --mode fake` |
| `public/style.tokens.json` | the app's own style file (the platform's default style) |
| `styles/app.css` | Tailwind for the frame, and the app's own few rules |
| `scripts/` | `check-build.mjs`, `browser-proof.mjs`, and in the library `take.mjs` |

## Not yet proven live

Proven so far only against the fake platform, on 2026-11-21. Not yet run against GilbPlatform production:

1. Sign-in from a local port with a real emailed code, and staying signed in across a reload.
2. The first sign-in making the person's vault for the app on production (it needs a real `vaultType`).
3. Share, the access list and Remove between two real people, and the second person opening the shared vault.
4. A style read from a saved style sheet (`styleSheetUrl`).
5. A real phone. A phone on your network cannot sign in to a local build (production admits localhost only), so this waits for a deployed build.
