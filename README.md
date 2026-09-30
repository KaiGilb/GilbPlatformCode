# GilbPlatformCode

Grab home for reusable GilbPlatformCode units.

This repository is the **code home** (clone or package-install). It is **not** the search. Search the Code repositories table in the App Builder vault (`https://appbuilder.gilb.com/base/e/06ge836ma5y05bpj958gsm966c`). If a row matches, copy the path it names from here. If none matches, stop. Do not search GitHub to learn that none exists.

Clone and package-install are both valid take paths; neither is exclusive.

Clone: `git clone https://github.com/KaiGilb/GilbPlatformCode.git`

## Units

| Path | Kind | Role |
|---|---|---|
| `units/note-write/` | note | WRITE only (view is a separate artefact) |
| `units/note-view/` | note | VIEW only (write is a separate artefact) |
| `units/signin/` | sign-in | Email one-time-code card. Host injects app / origin / auth / returnTo. |
| `units/result-total/` | count | Exact, lower bound, or guess. Never a bare number for a bound. |
| `units/format/` | text | Short file size and short date. A missing date stays blank. |
| `units/overlay-layers/` | popup order | Which overlay paints above which. The picker stays on top. |
| `units/type-name/` | name | Bare type name from a short name, a CURIE, or an address. |
| `units/share-link/` | link | A pointer to the current screen. Not a permission. |
| `units/search-pick/` | search | One search-and-pick. The catalogue is supplied by the host. |
| `units/field-control/` | field | One field. The kind picks the control. |
| `units/access-marks/` | access | Read, write, append, and control icons. |
| `units/predicate-tree/` | relations | Walk a relation tree. Read it backwards only when the catalogue says how. |
| `units/panes/` | layout | Left, centre, and right, with two drag handles. |
| `units/term-rank/` | search | Exact name, then a name that starts that way, then a word that starts that way. |
| `units/text-filter/` | filter | Keeps a row when every word of the query appears. |
| `units/lookup-text/` | lookup | The last part of a tag, and the stored text. |
| `units/phone-text/` | phone | Splits a stored phone. Does not guess a code. |
| `units/language-name/` | language | The name for the screen language, and the other names. |
| `units/scale-doc/` | scale | Levels from a scale document the host already fetched. |
| `units/color-scheme/` | theme | Light, dark, or follow the system. |
| `units/size-class/` | layout | Compact, medium, or expanded, from the window width. |
| `units/editorial-tokens/` | style | Light, dark, and colour-blind colour sheet. |
| `units/menu-place/` | popup | Puts a menu in the visible band. |
| `units/doc-label/` | name | The name a document states. Blank when it does not. |
| `units/principal-mark/` | access | Public only when the id matches exactly. |
| `units/vault-list/` | vault | Tree order, a name, and which vaults can be written. |
| `units/records-look/` | records | Grid, graph, both, or card. A folder click keeps the grid. |
| `units/file-words/` | files | The sentence for a download. Only a confirmed miss says the file is gone. |
| `units/graph-point/` | graph | The centre of a card, and where it lands on the pane. |
| `units/graph-contract/` | graph | What a click and a double-click do. |
| `units/graph-layout/` | graph | Places the cards. Directed links rank top to bottom. |

The rows that explain these units live in the vault table, not in this repository.
