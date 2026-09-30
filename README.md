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
| `units/format/` | text | Short file size, short date, and a date with time. A missing date stays blank. |
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
| `units/server-error/` | error text | The sentence from a refused request. A machine token is never shown alone. |
| `units/router-basename/` | router | The base path. A trailing slash is kept so a redirect cannot drop the query. |
| `units/copy-text/` | clipboard | Reports copied, unavailable, or denied. Does not throw. |
| `units/contact-actions/` | contact | Call, text, and email links. Does not invent a page for a bare @name. |
| `units/role-when/` | date | A role's date line. A missing end is not the word Present. |
| `units/vault-children/` | vault | Which child vaults to load. An empty choice loads the open vault only. |
| `units/specimen-role/` | role | The declared role line. Absence, unknown, and a known word stay different. |
| `units/id-tail/` | id | The last segment of an id. The two functions do not do the same thing. |
| `units/role-label/` | role | A role value shown with spaces. An empty role is the word Member. |
| `units/relation-members/` | relation | The members named on a relation. A bare word is kept only as an @id. |
| `units/stored-field/` | field | A field under two spellings, and a process name from the facts that are present. |
| `units/served-string/` | field | A stored string, or nothing. Blank and absent are both nothing. |
| `units/direct-shares/` | access | Readers and writers named on this record. Not the rest of access. |
| `units/page-window/` | list | Whether another page should be asked for. The complete flag is not the stop. |
| `units/display-friendly/` | name | A short label from an email or an address. Only a /base path shows the host. |
| `units/vault-address/` | vault | Whether a string is a vault address. A person and a record are not a vault. |
| `units/hands-off/` | link | Links to other records. A short name with a colon is not saved as a link. |
| `units/entity-ref/` | link | A stored address that points at another record. Does not load it. |
| `units/instruction-prefix/` | text | A leading tag token in a sentence. Not proof the tag is stored. |
| `units/statement-refs/` | text | Words and references in one sentence. A reference is not opened. |
| `units/step-instruction/` | text | The tag pill and the body a step shows. The pill is never invented. |
| `units/one-or-many/` | list | One object or a list, as a list. The single object is not dropped. |
| `units/list-move/` | list | Moves one item. The list stays the same length. |
| `units/string-list/` | list | One string or many, as a list. A blank string is not an entry. |
| `units/type-curie/` | type | A JSON-LD type as t:Name when the address says so. A bare word stays bare. |
| `units/compact-id/` | id | A short base: form becomes a full address. The short form is not kept. |
| `units/ref-keys/` | id | Spellings of one person id, and whether a row is a card field. |
| `units/employment-role/` | employment | Dates and place on one role. An end date is never still current. |
| `units/name-from-email/` | name | A first and last name from an email, or nothing. A messy address is not guessed. |
| `units/seat-address/` | address | The public address of a seat. A second /i address is not invented. |
| `units/prefs-choice/` | theme | Which saved theme and language win. A newer language row must not wipe dark. |
| `units/not-requested/` | text | The sentence for a read that was never issued. Not the sentence for an empty vault. |
| `units/step-order/` | list | Where a step sits, which steps a drag rewrites, and the facts a new step writes. |
| `units/spec-kind/` | type | Which card type a Value, Function, or Solution form stores. |
| `units/tag-carrier/` | tag | Which stored tag a record holds. Absence is only when both fields are empty. |
| `units/condition-tag/` | tag | The tag on one condition. A bare tag counts only when the condition is manual. |
| `units/claim-handle/` | id | Employment and title handles. A position and an identity are not the same token. |
| `units/person-address/` | address | Whether a paste is an address, a principal, or a person key. A /base vault is not a person. |
| `units/mail-tel/` | contact | mailto and tel prefixes. The prefix match is case-sensitive. |
| `units/activity-phrase/` | text | One sentence from language activities. Only the first letter of the last one is lowered. |
| `units/legacy-employment-key/` | employment | The old orgName and title keys. Index 1 has no number. |
| `units/narrow-total/` | count | A total after this page dropped rows. No server total means the kept count. |
| `units/created-id/` | id | The id of a step that was minted but not confirmed. Any other error has no id. |
| `units/vault-purpose/` | type | Which type a new vault may represent. Group stores CollectiveAgent. |
| `units/kind-home/` | type | Which standards home a type belongs to. Stanza is not its own home. |
| `units/scale-facts/` | scale | Scale fields on a relation. Endpoints alone are not content. |
| `units/occurred-at/` | scale | When and where a relation happened, stored as text. Not an at-value object. |
| `units/record-plane/` | records | Which rows are not content. A file is hidden on the register and kept for a relation. |

Each new unit has a README in its folder: what it is, what it is not, what you pass, what you get, and the mistakes not to make. The rows that explain these units live in the vault table, not in this repository. The README is there so the code can be taken before that row is written.
