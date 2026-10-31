/**
 * A person card's Interests, each with its note. The skill's code with the interest's terms:
 *   - picked through the SAME picker (`SkillPickerSheet`, `noun="interest"`, the same catalogue search);
 *   - stored as ONE held claim per (person, interest) in the vault that holds the record, through the shared held-note store
 *     (`useHeldNotes("interest")`): `a:heldParty`, `a:topicInterest`, `a:statedBy`, and the note `a:topicInterestNote` on the same claim
 *     (`SkillDepthNote`, `noun="interest"`).
 * ⚠ What differs from skills, and why: a skill is also one of the record's values (`a:skill` is a field of Person); an interest is NOT
 * (`a:topicInterest` has no `a:fieldOf`), so here the claim IS the card's interest: adding one makes its claim, removing one deletes it. The
 * person's record is not written.
 *
 * 🔴 NOT SHARED: no audience pill, no rung. The claims stay in the holder's vault (`held-notes` refuses a rung or a claim subject).
 *
 * An interest is shown by its NAME, never by its address: the name picked in this session, else the term's own label, else (while it is read) "…",
 * else (the read failed or gave no label) the catalogue name in the term's address, else the word "An interest". No line shows the address.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HeldVisibilitySwitch, AddedByLine } from "@kaigilb/gilbplatformcode-added-by";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { skillReferentUri, type ThinSkill } from "@kaigilb/gilbplatformcode-contact-rows";
import { useHeldNotes } from "@kaigilb/gilbplatformcode-held-notes";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { SkillDepthNote, SkillPickerSheet } from "@kaigilb/gilbplatformcode-skill-picker-sheet";
import { referentNameOf, termNameWord } from "@kaigilb/gilbplatformcode-term-name-text";
import { termLabelOfIri } from "@kaigilb/gilbplatformcode-term-slots";

/** What is shown while a term's label is being read. */
export const INTEREST_READING_TEXT = "…";

/**
 * The name of each catalogue term, asked of the term (a name just picked is shown at once). One read per term per mount; the answer is the term's own
 * label. Returns the name to show for an address, in every state: never the address, never a part of it.
 */
function useTermNames(iris: readonly string[], picked: Readonly<Record<string, string>>): (iri: string) => string {
  /** `string`: the label; `null`: the term gave none (or the read failed); absent: being read. */
  const [labels, setLabels] = useState<Readonly<Record<string, string | null>>>({});
  const asked = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const key = iris.join("\n");
  useEffect(() => {
    for (const iri of iris) {
      if (picked[iri] || asked.current.has(iri)) continue;
      asked.current.add(iri);
      void termLabelOfIri(iri).then((l) => {
        if (alive.current) setLabels((p) => ({ ...p, [iri]: l }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, picked]);
  return (iri) => {
    const given = picked[iri];
    if (given) return given;
    if (!(iri in labels)) return INTEREST_READING_TEXT;
    return labels[iri] ?? referentNameOf(iri) ?? termNameWord("interest");
  };
}

export function InterestRows({
  vaultId,
  principal,
  recordEntityUri,
  canEdit,
}: {
  /** The vault that HOLDS the person's record — where the interests are written and read. */
  vaultId: string | null;
  /** The signed-in principal, granted read on each claim at mint. */
  principal: string | null;
  /** The person's record: every claim's `a:heldParty`. */
  recordEntityUri: string;
  canEdit: boolean;
}) {
  const notes = useHeldNotes("interest", vaultId, recordEntityUri, principal);
  // s8 card look: presentation shows the interests as text (no (−), no "Add interests", nothing at all when there are none).
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  const allowEdit = canEdit && !present;
  const [picking, setPicking] = useState(false);
  /** Names picked in this session, shown before the term's own label is read. */
  const [picked, setPicked] = useState<Readonly<Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const topics = notes.topics();
  const nameOf = useTermNames(topics ?? [], picked);
  // A person with no landing vault of their own cannot add (the interest would have no source): the group is not drawn (nor offered under
  // "+ Add Information"). The card says why once, where the kinds of contact sit.
  if (notes.noOwnVault && canEdit) return null;

  const add = (skill: ThinSkill) => {
    setPicking(false);
    let iri: string;
    try {
      iri = skillReferentUri(skill);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setPicked((p) => ({ ...p, [iri]: skill.tag }));
    setError(null);
    void notes.add(iri).then((ok) => {
      if (!ok) setError(notes.errorFor(iri) ?? "This interest was not added. Try again.");
    });
  };

  return (
    <CardGroup kind="interest" testId="interest-section" title="Interests" icon="interest" empty={(topics ?? []).length === 0 && !notes.readError && !error}>
      {notes.readError && (
        <p role="alert" className="text-[12.5px] text-[var(--bad)]" data-testid="interest-notes-read-error">
          {notes.readError}
        </p>
      )}
      {(topics ?? []).map((iri) => (
        <div key={iri} className="flex items-start gap-2 py-2" data-testid="interest-row">
          {/* s8 card UX: MyNet's delete control at the LEFT of the row, in front of the interest it removes
              (MyNet `InterestsCard`: `<RemoveControl className="mt-1" label="Remove interest …">` first in the row). */}
          {allowEdit && notes.editableFor(iri) && (
            <RemoveControl
              className="mt-1"
              testId="interest-row-remove"
              label={`Remove interest ${nameOf(iri)}`}
              onClick={() => {
                setError(null);
                void notes.removeFor(iri).then((gone) => {
                  if (!gone) setError(notes.errorFor(iri) ?? "This interest could not be confirmed removed. Try again.");
                });
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            {present && canEdit ? (
              <button
                type="button"
                className="block min-h-10 w-full rounded-[var(--r-sm)] py-1.5 text-left text-[15px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                data-testid="interest-row-value"
                aria-label={`Edit interest ${nameOf(iri)}`}
                onClick={mode.enter}
              >
                {nameOf(iri)}
              </button>
            ) : (
              <p className="text-[15px] text-[var(--ink)]" data-testid="interest-row-value">
                {nameOf(iri)}
              </p>
            )}
            <SkillDepthNote
              noun="interest"
              skillName={nameOf(iri)}
              note={notes.noteFor(iri)}
              readOnly={!allowEdit || !notes.editableFor(iri)}
              saving={notes.savingFor(iri)}
              error={notes.errorFor(iri)}
              onCommit={(next) => notes.save(iri, next)}
            />
            {/* SB1b-2: who added it ("Added by you" / "Added by <name>" with a link to the card). */}
            {notes.sourceFor(iri) ? <AddedByLine item={notes.sourceFor(iri)!.item} own={notes.sourceFor(iri)!.own} hasSource={notes.sourceFor(iri)!.hasSource} /> : null}
            {/* SB1b-1: only on an interest the viewer added. */}
            {notes.markFor(iri) !== null && (
              <HeldVisibilitySwitch
                isPrivate={notes.markFor(iri) === "private"}
                editing={allowEdit}
                busy={notes.savingFor(iri)}
                noun={`interest ${nameOf(iri)}`}
                onSet={(makePrivate) => {
                  setError(null);
                  void notes.setPrivate(iri, makePrivate).then((ok) => {
                    if (!ok) setError(notes.errorFor(iri) ?? "Who sees this could not be changed. Try again.");
                  });
                }}
              />
            )}
          </div>
        </div>
      ))}
      {allowEdit && topics !== null && !notes.readError && (
        <button
          type="button"
          className="min-h-11 self-start text-[14px] text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          data-testid="interest-add"
          data-card-add=""
          onClick={() => setPicking(true)}
        >
          Add interests
        </button>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] text-[var(--bad)]" data-testid="interest-error">
          {error}
        </p>
      )}
      {picking &&
        createPortal(
          <SkillPickerSheet noun="interest" onPick={add} onClose={() => setPicking(false)} excludeUris={topics ?? []} />,
          document.body,
        )}
    </CardGroup>
  );
}
