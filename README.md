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
| `units/relation-count/` | graph | Which records stay within a hop depth of the selection. Not a count of relations. |
| `units/term-view/` | ontology | Fields of a term the host already fetched. A missing field stays empty. |
| `units/frozen-tag/` | tag | A document tag can be set or cleared. It cannot be renamed in place. |
| `units/contact-purpose/` | contact | Work or Private from an email slot. A phone slot is not a purpose. |
| `units/vcard-line/` | contact | Escapes and folds one vCard line. Does not build the card. |
| `units/folder-public-words/` | files | The sentence when a public folder could not make something public. Only the first failure is quoted. |
| `units/named-type/` | type | Bare type names for a word search. An empty list is not a search of every type. |
| `units/spec-card-facts/` | type | The facts a Value, Function, or Solution form stores. The type name is a different unit. |
| `units/text-find-words/` | text | The two sentences under an inside-text find. Only an exact zero says nothing matched. |
| `units/history-value/` | text | A short reading of one stored value. A long value is cut. A name is not fetched. |
| `units/history-actor/` | text | Who is named on a change, from the address alone. A person is not looked up. |
| `units/history-events/` | text | One line per save from a term's change rows. The history itself is not loaded. |
| `units/status-level/` | filter | Suggested, Approved, and Deprecated: colour, default, and which rows stay listed. |
| `units/column-narrowing/` | filter | Cuts three columns with the filters you register. A filter that is not ready yet is not applied. |
| `units/prefs-row/` | prefs | Which preferences row to write. The smallest id, not the newest. |
| `units/admitted-name/` | name | The name a profile may publish. An unadmitted field is skipped. The rung is not the test. |
| `units/name-cap/` | name | Capitalises a given name or a family name. Every other field is left as typed. |
| `units/step-removal/` | list | Whether one step id left the served list. A duplicate id still counts as present. |
| `units/condition-removal/` | list | Whether one condition left the served list, by content. Order is part of the check. |
| `units/place-clear/` | place | Clears a place rung on a draft. Does not choose who can see it. |
| `units/share-refusal/` | text | The sentence for a refused share. The server's reason is kept. |
| `units/card-fact-edge/` | graph | The synthetic link between a card field and a person. Not a stored relation. |
| `units/strong-etag/` | field | The validator to send back. A weak marker is removed. Quotes stay. |
| `units/request-htu/` | address | The request address a proof is bound to. The query is not part of it. |
| `units/search-tokens/` | search | The words in a search box, for display and ordering. Not the match that keeps a person. |
| `units/member-paste/` | list | Splits a member box into entries. A comma splits. It does not decide who is a person. |
| `units/vault-scoped-id/` | id | The vault id in a vault-scoped address. A missing slash is not an id. |
| `units/label-hyphen/` | text | A label made into a single hyphenated word. Not the list of relation verbs. |
| `units/canonical-host/` | address | The address to open instead, when this host is not the one the app serves. |
| `units/place-lines/` | place | Which street and which place ids an address still holds. A field street wins even when it is blank. |
| `units/facet-errors/` | text | The search failures as one sentence. A missing place catalogue is not one of them. |
| `units/condition-title/` | text | The title of one condition, trimmed. The entry and exit lists have stored names. |
| `units/unnamed-person/` | name | A label when no name was admitted. Never the raw address. |
| `units/place-field-kind/` | place | Whether one address field is a street, a place, or neither. Both at once is neither. |
| `units/record-write/` | access | Whether this session may write one record. A reader grant is not a write ban when this session stored the row. |
| `units/principal-key/` | address | The opaque card key, the friendly card address, and which connect targets are accepted. |
| `units/person-ruling-key/` | address | One spelling for a remembered person ruling. A missing ruling still admits the principal. |
| `units/document-rename/` | text | The title prefill and the rename patch. The key is the bare slug title. A blank string hides the wire title. |
| `units/place-display/` | place | The heading and text for one catalogue place. An unresolved value stays the raw value. |
| `units/claims-on-vault/` | list | Which claims belong on this seat. A claim vault id is not trimmed. |
| `units/holder-link/` | link | Whether a stored link may be read here. A bare id may. Another host may not. |
| `units/place-line/` | place | Place names joined with a middle dot. Not a count. |
| `units/working-set-order/` | list | Display order and the working-set address parameters. Not a search. The type registry is not included. |
| `units/term-does/` | text | The definition on a term document already read. A failed read is not an empty definition. |
| `units/bridge-host/` | address | Whether the app host and the vault host differ, so a session cookie may not be sent. |
| `units/chat-agent/` | text | The two chat agents. An unknown stored value is Jackfruit, not an error. |
| `units/statement-href/` | link | Which statement text may be opened. Only http and https. The stored spelling is kept. |
| `units/vault-row/` | vault | The row for one vault id, and the vault a session starts in. An id has no first-row fallback. |
| `units/org-listing/` | list | Whether a listing value is public or private. A value that is neither is shown as public. |
| `units/relation-ends/` | relations | The source end and the target end of a relation already read. A short base id expands from that document. |
| `units/raw-files-path/` | file | Whether a value is a raw file path. It is not a picture address. |
| `units/predicate-heading/` | text | A heading made from a predicate's own spelling. Not a decision to show the field. |
| `units/skill-uri-label/` | name | A short label from a skill address when the catalogue gave no name. |
| `units/group-vault/` | vault | Whether a vault is a group. The type addresses are passed in. |
| `units/not-a-person/` | access | The server's ruling that this principal is not a person. A failed read is not that ruling. |
| `units/skill-browse/` | search | Parent groups and a ranked search over skills already in hand. Not a catalogue fetch. |
| `units/blast-radius/` | list | Who depends on one term, from an index already loaded. A missing index is not an empty neighbourhood. |
| `units/place-kept/` | place | Whether the saved address still holds what was written. The audience is not compared. |
| `units/addressable-slug/` | field | Whether a served key is a slug this app can prefix. A foreign predicate is not one. |
| `units/type-spell/` | type | One absolute type address from any spelling. The host supplies the address. A foreign address stays as it was. |
| `units/grantee-hits/` | access | Which reachable vaults match a name, and which the registry already offered. An address is not a match. |
| `units/prefs-signature/` | prefs | The wire signature of one preference payload. The same facts match. Key order does not. |
| `units/command-match/` | search | Whether a command label or keyword contains the query. An empty query keeps the command. |
| `units/graph-node-id/` | graph | Stable ids for a relation node and a pendant node. A record id must not collide with either. |
| `units/principal-row/` | access | The four lines of one access row. A missing name is not the key, and silence is not a fact. |
| `units/claim-slot/` | claim | The slot string that keeps two employments from sharing one claim. The kind is exact. |
| `units/entity-name/` | name | The name a row shows, the slug a name box binds to, and the label a write copies. Three questions. |
| `units/folder-part/` | folder | Which already-read link is a member of a folder. The folder is the whole. Ended is dropped only from the document. |
| `units/type-plane/` | type | Which plane a term sits on. First match wins. A present key is not the same as a true flag. |
| `units/name-field/` | name | The two searchable name fields. Any other profile type is not one. |
| `units/owned-claim/` | claim | Which claims belong to one employment. The title token keeps later colons. |
| `units/map-limit/` | list | Run a list with a cap on how many run at once. Order matches the list. |
| `units/card-ref/` | graph | Which row is a card field, and which spellings name the same person. The host passes the origin. |
| `units/place-gate/` | place | Which place fields a viewer may see, and why a migration must not run. |
| `units/process-tag/` | tag | The document tag on a process. A rename of an existing tag is refused. Spaces are not a clear. |
| `units/neighbour-hops/` | graph | How many hops to walk. No selection walks none. All means three, not every record. |
| `units/narrowing-cut/` | filter | Apply filters the host registered. A filter that is not ready does not empty the list. |
| `units/vault-namespace/` | vault | The vault root inside an entity address, and an entity address under a root. A trailing slash on the root is not a root. |
| `units/jwt-subject/` | session | The sub claim from a token the caller already holds. The signature is not checked. |
| `units/ontology-ref/` | type | Whether a string is a store id, and the term address on a host the caller passes. |
| `units/create-kind/` | type | Which create-list a node kind belongs on. Relation, attribute, and scale are not on it. |
| `units/search-words/` | search | Spaced words from a type name, and the queries to try when a bare name misses. |
| `units/resource-id/` | id | The opaque id from a resource address. An address that is not one is returned unchanged. |
| `units/fact-faithful/` | field | Whether a fact can be shown as text without dropping part of it. |
| `units/photo-location/` | photo | Whether a photo address is ready to show, and the file path a stored location becomes. |
| `units/process-name/` | name | The name a process document states. A miss is blank. The id is not a name. |
| `units/stored-spelling/` | field | The key a write must use. A renamed or assembled key is not prefixed. |
| `units/browse-kind/` | type | Type, function, or value from a term document already read. Relation stays a type. |
| `units/cited-standard/` | list | Every standard one checklist question cites. A single string and a list are both read. |
| `units/wire-key/` | field | The read spelling of a stored attribute. One leading a: is removed. This is not a write. |
| `units/name-gap/` | name | Whether a found person is still missing a given name or a family name. A space is not a name. |
| `units/member-name/` | name | What to call one group member, and which address identifies the row. www and id are kept. |
| `units/credential-surface/` | access | Whether an error must be shown. These five names are not a shorter list. |
| `units/term-hops/` | type | The term addresses inside a declared identity. A foreign path is dropped. |
| `units/short-query/` | search | How many more letters a type search still needs. The minimum is passed in. |
| `units/catalog-path/` | file | The catalog file under an app mount. A missing slash is added. A leading slash is not. |
| `units/vault-modes/` | vault | Read and write kept. Append and control are dropped. A missing id is not a row. |
| `units/modes-label/` | vault | The words for a mode set. Both modes are one sentence. Append is not a word here. |
| `units/session-vault-name/` | vault | The sign-in vault name, or Unnamed vault and its id. Not the reachable-vault label. |
| `units/term-ref/` | type | An absolute address kept as a reference. A local name is not turned into an address. |
| `units/app-basename/` | file | The app mount with one trailing slash removed. A missing mount becomes an empty path. |
| `units/standing-notice/` | text | The sentence when standing instructions did not load. An empty group is not an unread vault. |
| `units/ontology-status/` | field | A write-side status word. Retired and withdrawn become Deprecated. Suggested is the fallback. |
| `units/label-type-name/` | name | A type name from a label. The rest of each word is not lowercased. A non-ASCII letter is a break. |
| `units/vault-origin/` | vault | The origin of an entity address. The same host keeps the origin the caller passed, scheme included. |

Each new unit has a README in its folder: what it is, what it is not, what you pass, what you get, and the mistakes not to make. The rows that explain these units live in the vault table, not in this repository. The README is there so the code can be taken before that row is written.
