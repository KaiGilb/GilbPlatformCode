# updated-line

## What this is

The one line a page shows while it revalidates and after, a note for a copy that could not be brought up to date, and a refresh button's feedback in plain words.

React components and one hook. The line is a polite status region ("Updating…", then "Updated 14:05"). The stale note appears when the last update failed and the copy on screen is older than an hour. The refresh feedback says "Updating…", then "Updated just now", "Nothing new", or the reason in plain words; an error is an alert.

- `UpdatedLine({ updating, updatedAt, testid?, labels?, locale?, className? })`: a `<span role="status" aria-live="polite">`. Empty before the first answer.
- `StaleNote({ error, updatedAt, now?, testid?, labels?, locale?, className? })`: a `<p role="status">`, or nothing when there is no error, no copy, or the copy is younger than `STALE_NOTE_AFTER_MS`.
- `useRefreshNote(run, sigNow, options?)`: returns `{ note, press, clear }`. `run` loads now and answers `{ ok: true, sig }` or `{ ok: false, why }`; `sig` is a signature of the data, compared with `sigNow()` taken before the load. A press while one runs does nothing. `options.labels` is read at press time.
- `RefreshNoteLine({ note, testid?, className?, errorClassName? })`: shows the note; an error is a `<p role="alert">`, the others a polite status.
- `whenText(ms, now?, locale?)`: the time alone when it is from today, else the day too ("Mon 26 Oct, 01:53"; with the year when it is not this year).
- `plainWhy(error, noReason?)`: the reason in a few words, without addresses; `noReason` when there is none that fits (120 characters at most).
- `STALE_NOTE_AFTER_MS` (one hour), `DEFAULT_LABELS`, `DEFAULT_CLASSES`, and the types `RefreshNote` and `UpdatedLabels`.

## Parameters

Every sentence, the locale and every class name is a parameter. The defaults are the English words and classes the source app used.

- `labels` (a `Partial<UpdatedLabels>`; a label you leave out keeps its default):

| Label | Default |
|---|---|
| `updating` | `Updating…` |
| `updated(when)` | `Updated <when>` |
| `stale(when, why)` | `Showing what was loaded on <when>; could not reach your workspace. <why>.` |
| `noReason` | `the platform did not answer` |
| `justUpdated` | `Updated just now` |
| `nothingNew` | `Nothing new` |
| `couldNotUpdate` | `Could not update just now. What you see is as it was. Try again in a minute.` |

- `locale` (a BCP 47 tag): used for the time and the day. Without it the time follows the runtime's locale and the day is written as `en-GB`.
- `className`, `errorClassName`: replace the default classes of `DEFAULT_CLASSES` (`line`, `stale`, `error`, `note`).
- `testid`: the default ids are `updated-line`, `stale-note` and `refresh-note`.

## What this is not

- Not a loader: it does not fetch or cache anything. The host's `run` does.
- Not translated: it ships English defaults; a host passes its own words.
- Not styled for you: the default classes are Tailwind arbitrary classes that read four CSS variables of the host (see below). A host without Tailwind passes its own `className`.

## How to take it

Package: `@kaigilb/gilbplatformcode-updated-line`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/updated-line
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

`react` (`^19.0.0`) is a peer; your app has it. The package ships TypeScript source (`src/`); your bundler compiles it. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```tsx
import { RefreshNoteLine, StaleNote, UpdatedLine, useRefreshNote } from "@kaigilb/gilbplatformcode-updated-line";

function Heading({ updating, updatedAt, error, reload, signature }: Props) {
  const { note, press } = useRefreshNote(
    async () => (await reload()) ? { ok: true, sig: signature() } : { ok: false, why: "the server is down" },
    signature,
    { labels: { nothingNew: "Already up to date" } },
  );
  return (
    <>
      <UpdatedLine updating={updating} updatedAt={updatedAt} locale="en-GB" />
      <StaleNote error={error} updatedAt={updatedAt} />
      <button onClick={press}>Refresh</button>
      <RefreshNoteLine note={note} />
    </>
  );
}
```

## What the host must supply

- The four CSS variables the default classes read: `--ink-faint` (the line), `--ink` (the stale note), `--bad` (an error), `--ink-soft` (the other notes). Or pass `className` and `errorClassName` and supply none.
- `run` and `sigNow` for `useRefreshNote`.
- Nothing else. No setting and no start-up call.

## Module state

None. The unit holds only constants.

Dynamic imports in the files taken: none.

## Do not

- Do not pass a new `labels` object and expect `press` to change identity: it is read at press time, so `press` changes only when `run` or `sigNow` do.
- Do not put an address or a stack in the reason you pass as `why`: `RefreshNoteLine` shows it as given. (`StaleNote` strips addresses through `plainWhy`.)

## Wrong readings

- "`StaleNote` shows whenever the update failed." It shows only when the copy on screen is also at least an hour old.
- "`plainWhy` keeps the whole message." It removes `http(s)` addresses and trailing dots, and answers `noReason` when what is left is empty or longer than 120 characters.
- "`locale` changes the default for the day only." With a locale, the time and the day both use it.
- "`useRefreshNote`'s `why` goes through `plainWhy`." It does not; it is shown as given.

## Where it came from

`KaiGilb/Social` (private repo), commit `a1f65a5b2567d5dbdfa91fa8e64e7b2af84fa66e`, copied by script and then edited for parameters: `src/ui/Updated.tsx` lines 1-64 to `src/Updated.tsx` (`whenText`, `STALE_NOTE_AFTER_MS`, `UpdatedLine`, `plainWhy`, `StaleNote`, `RefreshNote`, `useRefreshNote`, `RefreshNoteLine`). The file imports only `react`; it does not import `principal-hub`.

Named changes, and only these:

1. the header comment loses its cycle tag, and the comment of `whenText` loses its batch tag;
2. `whenText` takes an optional `locale`, `plainWhy` an optional `noReason`, `useRefreshNote` an optional `options.labels`; `UpdatedLine` and `StaleNote` take optional `labels`, `locale`, `className`; `RefreshNoteLine` takes optional `className` and `errorClassName`;
3. the sentences and the four class strings move into `DEFAULT_LABELS` and `DEFAULT_CLASSES` with the same text, and the code reads them from there.

No default value, role, aria attribute or test id changed. `src/index.ts` is new.

Tests (`src/*.test.tsx`; no shared set-up; jsdom): `Updated.test.tsx`. Two tests are ported from the source app's `p154-principal-hub.test.tsx` ("a stale copy says so": `whenText` day and time, and the `StaleNote` conditions), with the same inputs and expectations. The others are new: they pin every export with its defaults and each added parameter. `hostAgnostic.test.ts` is the same host-agnostic check test as the other units, with `react` allowed as an import.

Left out: the source tests that reach these components through the app's pages (`p153-s5-connect`, `p153-s5-views`, `p153-flow-sources`, `p153-topics-cache`, `p89-flow-page`, `p154-b4`, `p154-principal-hub` page block), which run the app's pages and a stubbed network.
