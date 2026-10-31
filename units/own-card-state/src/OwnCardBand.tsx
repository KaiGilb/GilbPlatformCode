// The band at the top of the holder's own card, and the words on its grid row. The own card says it is the holder's own card and
// whether it is the card MyNet shows; it is read only here, with one "Edit in MyNet" link to the profile editor; when a second own
// card is seen, the band says so and repairs nothing. ⛔ No write, no repoint, no delete.
import type { OwnCardState } from "./ownCardState";
import { myNetProfileUrl } from "./myNetProfileUrl";

/** Words of the band and the row mark, in one place. */
export const OWN_CARD_WORDS = {
  mynet: "Your own card. This is the card MyNet shows.",
  own: "Your own card.",
  other: "MyNet uses a different card of you.",
  openOther: "Open the card MyNet shows",
  also: "You have one more card of you in this vault. MyNet does not show it, and nothing has been changed on either card.",
  openAlso: "Open the other card",
  readOnly: "Your own card is edited in MyNet, so what you change reaches the people in your circles at the level you set.",
  onlyHere: "Skills, interests, languages and employment shown here are only here, not on your MyNet card.",
  edit: "Edit in MyNet",
  rowMynet: "Your MyNet card",
  rowOwn: "Your own card",
  rowOther: "Your own card, not the one MyNet shows",
} as const;

/**
 * The band at the top of the own card.
 *
 * @param state the record's own-card state (`useOwnCard`); the band draws only for `own`
 * @param onOpen opens a record by id in this app (the other card)
 */
export function OwnCardBand({ state, onOpen }: { state: OwnCardState; onOpen: (id: string) => void }) {
  if (!state.own) return null;
  const s = state.standing;
  const idOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
  return (
    <section
      data-testid="own-card-band"
      data-own-card-case={s.kind}
      aria-label="Your own card"
      className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-hi)] px-3 py-2.5 flex flex-col gap-1.5 text-[13px] text-[var(--ink)]"
    >
      <p className="font-semibold" data-testid="own-card-caption">
        {s.kind === "mynet" ? OWN_CARD_WORDS.mynet : s.kind === "other" ? OWN_CARD_WORDS.other : OWN_CARD_WORDS.own}
      </p>
      {s.kind === "other" ? (
        <button
          type="button"
          data-testid="own-card-open-mynet-card"
          onClick={() => onOpen(s.mynetCardId)}
          className="self-start min-h-[44px] text-left text-[var(--accent-ink)] underline underline-offset-2"
        >
          {OWN_CARD_WORDS.openOther}
        </button>
      ) : null}
      {s.kind === "mynet" && s.alsoCards.length > 0 ? (
        <div data-testid="own-card-also" className="flex flex-col gap-1 text-[var(--ink-soft)]">
          <p>{OWN_CARD_WORDS.also}</p>
          {s.alsoCards.map((uri) => (
            <button
              key={uri}
              type="button"
              onClick={() => onOpen(idOf(uri))}
              className="self-start min-h-[44px] text-left text-[var(--accent-ink)] underline underline-offset-2"
            >
              {OWN_CARD_WORDS.openAlso}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-[var(--ink-soft)]">{OWN_CARD_WORDS.readOnly}</p>
      <p className="text-[var(--ink-soft)] text-[12.5px]" data-testid="own-card-only-here">
        {OWN_CARD_WORDS.onlyHere}
      </p>
      {/* Contrast (WCAG AA 4.5:1): the text tokens here are `--ink-soft` and `--accent-ink`, measured 5.55:1 and
          5.62:1 (light), 5.85:1 and 6.81:1 (dark) on the band. `--ink-faint` (3.58:1) and `--accent` (4.49:1) failed. */}
      {/* A new tab: MyNet is its own app with its own sign-in road, and the holder keeps his place here. */}
      <a
        href={myNetProfileUrl()}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="own-card-edit-in-mynet"
        className="self-start inline-flex items-center min-h-[44px] px-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] font-medium text-[var(--accent-ink)] hover:bg-[var(--sel)]"
      >
        {OWN_CARD_WORDS.edit}
      </a>
    </section>
  );
}

/**
 * The words on the own card's grid row, or null for any other row.
 *
 * @param state the row record's own-card state
 */
export function ownCardRowWords(state: OwnCardState): string | null {
  if (!state.own) return null;
  return state.standing.kind === "mynet" ? OWN_CARD_WORDS.rowMynet : state.standing.kind === "other" ? OWN_CARD_WORDS.rowOther : OWN_CARD_WORDS.rowOwn;
}
