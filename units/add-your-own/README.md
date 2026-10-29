# add-your-own

Draws the "+ Add your own" button and its inline form for a merged card.

## What this is

Draws the "+ Add your own" button and its inline form for a merged card.

Plain React, inline styles, no state outside the component. When a person has an online card (the master), they can still add their own fields to it. Under each group of the card there is a quiet "+ Add your own" button; pressing it opens a small form in that group; Save puts the value on the holder's own card, private; the online card is not touched. This unit draws the button and the form. The field editor inside the form, and the write, are the host's.

- `AddYourOwnButton({ noun, onPress, buttonRef?, disabled? })`: the quiet button alone (`data-testid="add-own"`, `aria-label` `Add your own <noun>`), for a host editor that opens its own way (a picker sheet, an address form). `buttonRef` lets the host return the focus to it when its editor closes.
- `AddYourOwn({ noun, onSave, onOpen?, onCancel?, message?, children, disabled? })`: the button, and once pressed the in-place form (`add-own-form`, `aria-label` `Your own <noun>`) around the host's field editor (`children`), with Save (`add-own-save`), Cancel (`add-own-cancel`) and the private hint (`add-own-hint`).
  - Pressing the button calls `onOpen`, opens the form and puts the focus in the first enabled field of `children`.
  - Save calls `onSave`. `true` (or a promise of `true`): stored, the form closes and the focus returns to the button. `false`, a rejected promise or a thrown error: not stored, the form stays open, nothing typed is lost, and the focus goes back to the first field.
  - While a save runs, Save reads "Saving…" and is disabled, Cancel is disabled, Escape does nothing, and a second submit in the same moment (two Enters, Enter and a click) calls `onSave` once.
  - Escape (inside the form) and Cancel call `onCancel`, close the form and return the focus to the button. Escape is stopped from reaching handlers outside the form.
  - `message` is the host's validation line or save error, shown as `role="alert"` (`add-own-message`). While it stands, each field in the form gets `aria-invalid="true"` and the message's id in `aria-describedby` (the field's own `aria-describedby` words are kept); when it goes, only what the form set is taken back.
  - Enter in a field saves, through the browser's own implicit form submission. The form has `noValidate`: the host's editor does the validating.
- `ADD_OWN_WORDS`: the only words the unit has: `button`, `buttonName(noun)`, `formName(noun)`, `save`, `saving`, `cancel`, `hint`.
- Types: `AddYourOwnButtonProps`, `AddYourOwnProps`.

## What this is not

- Not a field, a value, a read or a write. The editor is `children`; the save is `onSave`, which goes through the host's own write path.
- Not a validator. The host shows its line through `message`.
- Not the group. It draws no group heading and decides nothing about which group it sits in.
- Not a theme. It reads the host's CSS variables and falls back to a literal.

## How to take it

Package: `@kaigilb/gilbplatformcode-add-your-own`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/add-your-own
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. The unit draws with inline styles only, so no Tailwind scan is needed.

## Examples

```tsx
import { AddYourOwn } from "@kaigilb/gilbplatformcode-add-your-own";

function EmailGroup() {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <AddYourOwn
      noun="email"
      onOpen={() => { setDraft(""); setError(undefined); }}
      onCancel={() => setDraft("")}
      onSave={async () => {
        const result = await saveEmail(draft); // yours
        if (!result.ok) setError(result.message);
        return result.ok;
      }}
      message={error}
    >
      <input aria-label="Email value" value={draft} onChange={(e) => setDraft(e.target.value)} />
    </AddYourOwn>
  );
}
```

## What the host must supply

- React 19.
- The field editor (`children`), the save (`onSave`) and the message (`message`).
- Nothing else is required. The CSS contract is below.

### CSS contract

Every colour is a chain `var(--host, var(--second, literal))`: the host's variable first, a second app's variable second, a literal last. A host with none of the variables still draws.

| Host variable | Second variable | Literal fallback | Draws |
|---|---|---|---|
| `--ink` | `--color-ink` | `#2a2622` | Cancel's text |
| `--ink-soft` | `--color-ink-secondary` | `#67635e` | the form's label and the hint |
| `--accent-ink` | `--color-primary` | `#8f4e33` | the button's text |
| `--accent` | `--color-primary` | `#a85c3b` | Save's background and border |
| `--on-accent` | `--color-on-primary` | `#fbfaf6` | Save's text |
| `--surface` | `--color-card` | `#ffffff` | Cancel's background |
| `--line` | `--color-line` | `#d9d4cb` | Cancel's border |
| `--bad` | `--color-error-dark` | `#a5432c` | the message |
| `--r-sm` | none | `7px` | the corner radius of Save and Cancel |

The button and the labels use the accent ink and the soft ink, never a fainter ink (3.5:1 on a light surface is not enough). Every control is at least 44 px high (touch target).

## Do not

- Do not put a field, a value or a write inside this unit. Pass the editor as `children` and the write as `onSave`.
- Do not return `true` from `onSave` unless the value is stored: `true` closes the form.
- Do not clear the host's draft in `onSave` on failure. A save that is not stored keeps the form open so nothing typed is lost; drop the draft in `onCancel` and start a fresh one in `onOpen`.
- Do not rely on the browser's own validation bubble; the form is `noValidate`.

## Wrong readings

- "Cancel closes after a save starts." It does not: while a save runs Cancel is disabled and Escape does nothing.
- "A failed save closes the form." It stays open; the focus goes back into the first field so Escape still works.
- "`onCancel` runs on every close." Only on Cancel and Escape; a stored save closes the form without it.
- "The unit sets `aria-invalid` on fields for good." Only while `message` stands, and only on the attributes the form itself set.
- "`AddYourOwnButton` opens a form." It is only the button; the host opens whatever it opens.

## Where it came from

`KaiGilb/gilb-stakeholders-ui` (private repo), commit `69015111d0f8dc98406acb1579dba10f9ae471bb`: `src/AddYourOwn.tsx` lines 1-244 (whole file) to `src/AddYourOwn.tsx`, copied by script. Comments made generic (person names, cycle and ticket tags, agent names, app names and spec references removed); no code change. The file imports only React.

`src/index.ts` is new: it re-exports the file. The tests: the source's two test files (`test/AddYourOwn.*.test.tsx`, 13 tests) ported (import path changed, test titles and header comments made generic, and three wall-clock waits in the double-submit test replaced by `await act(async () => {})`), and a third file that pins every export, the words, the keys, the disabled states and the failure paths.
