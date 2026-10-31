/**
 * A person record's Email, Phone, Social and Skills sections. ONE section component for the four multi-valued terms.
 *
 * Titled with the term's label (from the master), one row per value with its sub-label, a remove control, and an add control.
 * Stored in the contact-rows layout of `contact-rows-model` (a value list and a sidecar), saved when a value is left.
 *   - Email: the sub-label is Work or Private; tap it to switch.
 *   - Phone: the value is the host's `PhoneValue` (country code + number). A sub-label is shown only when the stored entry has one,
 *     and there is no switch.
 *   - Social: a text value. A sub-label as for phone.
 *   - Skill: a skill is PICKED from the shared skill catalogue through the host's `SkillPickerSheet`, opened by the add control; a
 *     picked skill is shown by its name and, under it, the referent in small mono type, and is not edited in place, only removed. A
 *     free-text skill another app wrote is a text value. Saved the moment it is picked or removed, on the same per-record queue.
 *     Under a picked skill, the host's `SkillDepthNote` ("About this skill"), the holder's free text on what exactly the person can
 *     do within that skill. It is stored on its own held claim, ⛔ not in this record's values; removing the skill removes it.
 *
 * ⚠ No audience pill: a pill says who may see the owner's OWN profile field; this is a holder's record about someone else, which
 * publishes nothing (its sharing is the record's access).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AddYourOwn, AddYourOwnButton } from "@kaigilb/gilbplatformcode-add-your-own";
import { CardGroup, type CardIconName } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { phoneForUri, resolvableSocialHref, toMailtoHref } from "@kaigilb/gilbplatformcode-contact-actions";
import {
  contactRowsPatch,
  hasWorkPrivate,
  mergeContactRows,
  nextContactKey,
  readContactRows,
  type ContactKind,
  type ContactRow,
} from "@kaigilb/gilbplatformcode-contact-rows-model";
import { useAddInPlace, useOneCardOwn } from "@kaigilb/gilbplatformcode-one-card-context";
import { YourRow } from "@kaigilb/gilbplatformcode-one-card-rows";
import { eventTargetInTopDialog, modalIsOpen } from "@kaigilb/gilbplatformcode-open-popups";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { referentNameOf, termNameWord } from "@kaigilb/gilbplatformcode-term-name-text";
import { useContactRowsHost } from "./contactRowsHost";
import { joinPhone } from "./dialCode";
import { EMAIL_FORMAT_HINT, isEmailFormat } from "./emailFormat";
import type { HeldNotesState } from "@kaigilb/gilbplatformcode-held-notes";
import { isWebAddress, normalizeWebAddress, platformOf, WEB_ADDRESS_HINT } from "./onlineAccount";
import { skillReferentUri, type ThinSkill } from "./thinSkills";

/** The card's own field box (the holder's own value editors; also the "+ Add your own" name field). Add a border colour. */
export const OWN_FIELD_BOX = "w-full rounded-[var(--r-sm)] border bg-[var(--surface)] text-[var(--ink)] ";
/** The group icon of each kind of row (the title is the master's label; the icon only helps the eye). */
const GROUP_ICON: Record<ContactKind, CardIconName> = { email: "email", phone: "phone", social: "account", skill: "skill" };

/** A person record carries no place claims here: the phone's code box starts at "+" (see
 *  `useHomeDial` of the host). One constant, so the hook's key never changes. */
const NO_HOME_CLAIMS: never[] = [];

/**
 * A picked skill is named by its name: the one the sidecar entry cached, else the catalogue name in the skill's term address, else the word "A skill".
 * Never the address (`ref`) and never the last part of an address that is not a term address.
 */
function skillNameOf(r: ContactRow): string {
  return r.value || (r.ref ? referentNameOf(r.ref) : null) || termNameWord("skill");
}

export function ContactRows({
  kind,
  recordId,
  recordEntityUri,
  title,
  valueKey,
  metaKey,
  served,
  etag,
  canEdit,
  onSaved,
  skillNotes,
}: {
  kind: ContactKind;
  recordId: string;
  recordEntityUri: string | null;
  /** The section's title: the term's label from the master. */
  title: string;
  /** The term's fact key, from the master (type lookup). */
  valueKey: string;
  /** The sidecar term's fact key, from the master; null while it is being asked (read-only). */
  metaKey: string | null;
  /** The record's served value list and sidecar, verbatim. */
  served: { values?: unknown; meta?: unknown };
  /** The version the card read (`If-Match`), so a save never overwrites a newer sidecar. */
  etag: string | null;
  canEdit: boolean;
  onSaved: () => void;
  /** Skill rows only: the person's skill notes (the app's held-notes state for skills).
   *  Absent: no note is shown or written. */
  skillNotes?: HeldNotesState;
}) {
  const host = useContactRowsHost();
  const { useHomeDial, saveRecordSidecar, noteServedVersion, PhoneValue, SkillPickerSheet, SkillDepthNote, SocialLogo, socialPlatformName, HeldVisibilitySwitch, AddedByLine } = host;
  // Editing waits for the master to name the sidecar's spelling: ⛔ never a guessed key.
  canEdit = canEdit && !!metaKey;
  canEdit = canEdit && !!saveRecordSidecar;
  // The card is in PRESENTATION (values as text, no (−), no add row, no empty row) until a value is
  // clicked or Edit is pressed. Outside a person card there is no mode and the section is always editing, as before.
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  const allowEdit = canEdit && !present;
  const workPrivate = hasWorkPrivate(kind);
  // The words of the controls: email keeps its own word; phone and social use the master's label.
  const noun = kind === "email" ? "email" : title.toLowerCase();
  const suggestedDial = useHomeDial(NO_HOME_CLAIMS);
  const [picking, setPicking] = useState(false);
  const [rows, setRows] = useState<ContactRow[]>(() => readContactRows(kind, served));
  /** The row "add …" just made: it opens ready for typing . */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  useEffect(() => {
    if (present) setJustAdded(null);
  }, [present]);
  // The record's version and stored sidecar are held once per record, for every section
  // (the host's `saveRecordSidecar`). `baseRef` is this section's rows as last stored
  // (its last read or save): a 412 merges the person's changes since then onto the fresh rows (B1).
  const baseRef = useRef<ContactRow[]>(rows);
  const rowsRef = useRef<ContactRow[]>(rows);
  rowsRef.current = rows;
  const [error, setError] = useState<string | null>(null);
  /** Email rows not fitting name@domain.tld, or online accounts that are not a web
   *  address (shown, never saved). */
  const [badEmail, setBadEmail] = useState<ReadonlySet<string>>(new Set());
  /** Rows the person typed into in this session: only these are checked. A value already stored
   *  (a handle such as "@ann" that other apps allow) is shown as it is and never blocks a save. */
  const typed = useRef<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // `dirty` = the rows hold an edit not yet stored. `edits` counts every
  // edit; `pending` counts this section's saves queued or in flight. `dirty` is cleared only when no
  // save is left and nothing was edited since the last one began.
  const dirty = useRef(false);
  const edits = useRef(0);
  const pending = useRef(0);
  const servedKey = JSON.stringify([served.values ?? null, served.meta ?? null]);
  // A fresh read replaces the rows (and, when no save of the record is pending, the record's held
  // version), unless a save is queued or in flight or the person has unsaved edits: then it is
  // ignored (the save's own result, or its 412 merge, wins). A row the person added and left
  // empty is not an edit; it does not block the read and is kept below the rows read.
  useEffect(() => {
    noteServedVersion?.(recordId, etag, served.meta);
    if (dirty.current || pending.current > 0) return;
    const fresh = readContactRows(kind, served);
    const known = new Set(baseRef.current.map((r) => r.key));
    const added = rowsRef.current.filter((r) => !known.has(r.key) && !r.ref && !r.value.trim());
    const next = [...fresh];
    for (const r of added) next.push(next.some((x) => x.key === r.key) ? { ...r, key: nextContactKey(kind, next) } : r);
    baseRef.current = fresh;
    rowsRef.current = next;
    setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- servedKey stands for `served`
  }, [servedKey, etag]);

  /**
   * One save, on the rows as they are when it runs, through the record's one versioned serial save.
   * A 412 (another app, another tab, another device wrote since) re-reads the record; the person's own
   * changes since the last stored rows are merged onto the rows stored now (`mergeContactRows`: rows
   * added elsewhere are kept), the merged rows are shown, and they are sent once more.
   */
  const save = (next: ContactRow[]) => {
    // An address that does not fit is never saved: nothing in this section is written while one
    // stands, and the row says why.
    // The same for an online account: it must be a web address.
    const fits = kind === "email" ? isEmailFormat : kind === "social" ? isWebAddress : null;
    if (fits) {
      const bad = new Set(
        next.filter((r) => typed.current.has(r.key) && r.value.trim() !== "" && !fits(r.value)).map((r) => r.key),
      );
      setBadEmail(bad);
      if (bad.size > 0) return Promise.resolve(false);
    }
    // An online account is stored as a full link, labelled with its platform when it is a known one
    // ("LinkedIn", "X" …); an unknown site keeps whatever label it already had.
    if (kind === "social") {
      next = next.map((r) => {
        // A row emptied of its address is stored with no platform (the label belongs to the value).
        if (!r.value.trim()) return r.label ? { ...r, label: "" } : r;
        if (!typed.current.has(r.key)) return r;
        const value = normalizeWebAddress(r.value);
        return { ...r, value, label: platformOf(value) ?? r.label };
      });
      setRows(next);
    }
    rowsRef.current = next;
    if (!metaKey) return Promise.resolve(false);
    if (!saveRecordSidecar) return Promise.resolve(false);
    const key = metaKey;
    pending.current++;
    let began = -1;
    setSaving(true);
    setError(null);
    let sent: ContactRow[] = [];
    return saveRecordSidecar(
      recordId,
      recordEntityUri,
      key,
      (storedMeta) => {
        if (began < 0) began = edits.current;
        sent = rowsRef.current;
        const p = contactRowsPatch(kind, sent, storedMeta);
        return { patch: { [valueKey]: p.values, [key]: p.meta }, meta: p.meta };
      },
      (fresh) => {
        const stored = readContactRows(kind, { values: fresh.served?.facts[valueKey], meta: fresh.served?.facts[key] });
        const merged = mergeContactRows(kind, baseRef.current, rowsRef.current, stored);
        baseRef.current = stored;
        rowsRef.current = merged;
        setRows(merged);
      },
    )
      .then((v) => {
        baseRef.current = sent;
        return v;
      })
      .then(() => {
        pending.current--;
        if (pending.current === 0 && edits.current === began) dirty.current = false;
        onSaved();
        return true;
      })
      .catch((e: unknown) => {
        pending.current--;
        setError(
          e instanceof Error && e.message ? `The ${noun} could not be saved: ${e.message}` : `The ${noun} could not be saved.`,
        );
        return false;
      })
      .finally(() => {
        if (pending.current === 0) setSaving(false);
      });
  };
  /** Every change of the rows goes through here: it marks them dirty and counts the edit. (Adding
   *  an empty row does not; it is not a change of anything stored.) */
  const touch = () => {
    dirty.current = true;
    edits.current++;
  };

  const edit = (i: number, patch: Partial<ContactRow>) => {
    touch();
    if (patch.value !== undefined && rows[i]) typed.current.add(rows[i]!.key);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  /** The canonical referent, deduped by it, appended and saved at once. */
  const pickSkill = (skill: ThinSkill) => {
    setPicking(false);
    let ref: string;
    try {
      ref = skillReferentUri(skill);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const current = rowsRef.current;
    if (current.some((r) => r.ref === ref)) return;
    touch();
    const next = [...current, { key: nextContactKey(kind, current), label: "", value: skill.tag, ref }];
    setRows(next);
    void save(next);
  };

  // ── "+ Add your own" in place on the one card ──
  // While a linked person's card is presented, the group offers "+ Add your own": a small form in the group holds a DRAFT of one new
  // value; Save appends it as a new row exactly as "add …" does (the same key, the same Work / Private label) and stores it through
  // this section's own `save`, so the request is the one the existing editor sends for the same value. Cancel and Esc drop the draft:
  // nothing is written. ⚠ A draft, not a live row: the rows here store when a box is LEFT, and leaving the box for Cancel must not store.
  // The draft's boxes are this section's own: the same input and validation (email format, web address), and for a phone the two
  // boxes (country code + number) joined by `joinPhone` as `PhoneValue` joins them. A skill opens the section's own skill picker.
  const inPlace = useAddInPlace(canEdit);
  const [ownDraft, setOwnDraft] = useState({ value: "", dial: "", national: "" });
  const [ownMsg, setOwnMsg] = useState<string | null>(null);
  const addOwnRef = useRef<HTMLButtonElement | null>(null);
  /** The skill picker was opened by "+ Add your own": when it closes, the focus goes back to that button. */
  const pickingInPlace = useRef(false);
  useEffect(() => {
    if (picking || !pickingInPlace.current) return;
    pickingInPlace.current = false;
    addOwnRef.current?.focus();
  }, [picking]);
  useEffect(() => {
    // Esc closes the picker opened in place (the sheet itself closes on its own buttons only).
    if (!picking || !pickingInPlace.current) return;
    const esc = (e: KeyboardEvent) => {
      if (modalIsOpen() && !eventTargetInTopDialog(e.target)) return;
      if (e.key === "Escape") setPicking(false);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [picking]);
  const startOwn = () => {
    setOwnDraft({ value: "", dial: suggestedDial || "", national: "" });
    setOwnMsg(null);
    setError(null);
  };
  /** Save the draft as a new row through this section's `save`. True when stored; false keeps the form open. */
  const saveOwn = async (): Promise<boolean> => {
    const value = kind === "phone" ? (ownDraft.national.trim() ? joinPhone(ownDraft.dial, ownDraft.national) : "") : ownDraft.value;
    // An empty add is no change of anything stored: nothing is written, the form closes.
    if (!value.trim()) return true;
    const fits = kind === "email" ? isEmailFormat : kind === "social" ? isWebAddress : null;
    if (fits && !fits(value)) {
      setOwnMsg(kind === "email" ? EMAIL_FORMAT_HINT : WEB_ADDRESS_HINT);
      return false;
    }
    setOwnMsg(null);
    const before = rowsRef.current;
    const key = nextContactKey(kind, before);
    const next = [...before, { key, label: workPrivate ? (before.some((x) => x.label === "Work") ? "Private" : "Work") : "", value }];
    typed.current.add(key);
    touch();
    setRows(next);
    const stored = await save(next);
    if (!stored) {
      // Not stored: the row leaves the card again (it was never kept) and the draft stays in the form; the section says why.
      const back = rowsRef.current.filter((r) => r.key !== key);
      rowsRef.current = back;
      setRows(back);
      if (pending.current === 0) dirty.current = false;
    }
    return stored;
  };
  const ownBox = OWN_FIELD_BOX + (ownMsg ? "border-[var(--bad)]" : "border-[var(--line-2)]");
  // The section's own save error is shown with the add (its words, unchanged): under rows of theirs an empty own side is not drawn
  // while presented, so the error line among the rows would not be seen.
  const addOwn = !inPlace ? null : kind === "skill" ? (
    <>
      <AddYourOwnButton
        noun={noun}
        buttonRef={addOwnRef}
        onPress={() => {
          pickingInPlace.current = true;
          setPicking(true);
        }}
      />
      {error ? (
        <span role="alert" className="text-[12.5px] text-[var(--bad)]">
          {error}
        </span>
      ) : null}
    </>
  ) : (
    <AddYourOwn noun={noun} onOpen={startOwn} onCancel={startOwn} onSave={saveOwn} message={ownMsg ?? error}>
      {kind === "phone" ? (
        // The phone boxes, as `PhoneValue` draws them while editing.
        <div className="flex gap-2" data-testid="add-own-phone">
          <label className="flex w-24 shrink-0 flex-col gap-0.5">
            <span className="sr-only">Country code</span>
            <input
              aria-label="Country code"
              inputMode="tel"
              className={"min-h-11 px-2 text-[16px] " + ownBox}
              value={ownDraft.dial ? `+${ownDraft.dial.replace(/\D/g, "")}` : "+"}
              readOnly={ownDraft.national.trim().startsWith("+")}
              onChange={(e) => setOwnDraft((d) => ({ ...d, dial: e.target.value.replace(/\D/g, "") }))}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="sr-only">Phone number</span>
            <input
              aria-label="Phone number"
              inputMode="tel"
              className={"min-h-11 px-2 text-[16px] " + ownBox}
              value={ownDraft.national}
              onChange={(e) => setOwnDraft((d) => ({ ...d, national: e.target.value }))}
            />
          </label>
        </div>
      ) : (
        <input
          type={kind === "email" ? "email" : "text"}
          inputMode={kind === "email" ? "email" : "text"}
          aria-label={`Your own ${noun}`}
          placeholder={`Add ${noun}`}
          aria-invalid={!!ownMsg || undefined}
          className={"min-h-11 px-3 py-2 text-[15px] " + ownBox}
          value={ownDraft.value}
          onChange={(e) => setOwnDraft((d) => ({ ...d, value: e.target.value }))}
        />
      )}
    </AddYourOwn>
  );

  /** What presentation shows: a row with a value (or a picked skill). Never a blank row, never "add …". */
  const shown = (r: ContactRow) => !!r.ref || r.value.trim() !== "";
  // The one card: on a person linked to an online card each of these rows is marked Yours · private, and while the card is
  // presented a value the merge folded into a row of theirs ("You have the same on your card") is not drawn twice. In Edit it is here, as
  // before. Outside the one card nothing changes.
  const own = useOneCardOwn(kind);
  const ownRow = (key: string, node: ReactNode) =>
    own?.marks ? (
      <YourRow key={key} marks>
        {node}
      </YourRow>
    ) : (
      node
    );
  return (
    <>
    {/* The sheet is a full-window `fixed` overlay; the card may sit inside a region pane,
        so the sheet is put on the document body to cover the window whatever the pane's layout.
        Drawn beside the group, ⛔ not among its own rows: under rows of theirs an empty own side is not drawn while presented,
        and "+ Add your own" opens the picker from there. */}
    {picking && SkillPickerSheet &&
      createPortal(
        <SkillPickerSheet
          excludeUris={rows.map((r) => r.ref).filter((u): u is string => !!u)}
          onPick={pickSkill}
          onClose={() => setPicking(false)}
        />,
        document.body,
      )}
    <CardGroup kind={kind} testId={`${kind}-rows`} title={title} icon={GROUP_ICON[kind]} empty={!rows.some(shown)} addOwn={addOwn}>
      {rows.map((r, i) => (present && (!shown(r) || !!own?.folded(r.ref || r.value)) ? null : ownRow(r.key, present ? (
        <PresentRow
          key={r.key}
          kind={kind}
          row={r}
          title={title}
          workPrivate={workPrivate}
          noun={noun}
          note={
            r.ref && skillNotes ? (
              <>
                {SkillDepthNote ? (
                <SkillDepthNote
                  skillName={skillNameOf(r)}
                  note={skillNotes.noteFor(r.ref)}
                  readOnly
                  saving={false}
                  error={null}
                  onCommit={() => Promise.resolve(false)}
                />
                ) : null}
                {/* Who added the note. */}
                {AddedByLine && skillNotes.sourceFor(r.ref) ? <AddedByLine item={skillNotes.sourceFor(r.ref)!.item} own={skillNotes.sourceFor(r.ref)!.own} hasSource={skillNotes.sourceFor(r.ref)!.hasSource} /> : null}
                {/* The label only (nothing is edited in presentation). */}
                {HeldVisibilitySwitch && skillNotes.markFor(r.ref) === "private" ? <HeldVisibilitySwitch isPrivate editing={false} noun={`skill ${skillNameOf(r)}`} onSet={() => {}} /> : null}
              </>
            ) : null
          }
          noteText={r.ref && skillNotes ? (skillNotes.noteFor(r.ref) ?? "") : ""}
          editable={canEdit}
          onEnter={() => {
            setJustAdded(r.key);
            mode.enter();
          }}
        />
      ) : (
        <div key={r.key} className="flex items-start gap-2 py-2" data-testid={`${kind}-row`}>
          {/* The delete control, at the LEFT of the row, together with the
              content it deletes (`<RemoveControl className="mt-1">` first in the row). It
              replaces a text "×" at the far right that a person did not see and could mis-tap. */}
          {canEdit && (
            <RemoveControl
              className="mt-1"
              testId={`${kind}-row-remove`}
              label={
                workPrivate
                  ? `Remove ${r.label} ${noun}`
                  : r.ref
                    ? `Remove ${title} ${skillNameOf(r)}`
                    : `Remove ${title}${r.label ? " " + r.label : ""}`
              }
              onClick={() => {
                touch();
                const next = rows.filter((_, j) => j !== i);
                setRows(next);
                const ref = r.ref;
                void save(next).then((kept) => {
                  // The skill left the card, so its note goes too — only once the card
                  // has stored the removal (a refused save leaves the skill, and so its note).
                  if (!kept || !ref || !skillNotes) return;
                  void skillNotes.removeFor(ref).then((gone) => {
                    if (!gone) setError(`The ${noun} was removed, but its note could not be removed, so it is still stored.`);
                  });
                });
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            {workPrivate ? (
              <button
                type="button"
                disabled={!canEdit}
                className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)] disabled:cursor-default"
                title={canEdit ? "Switch between Work and Private" : undefined}
                data-testid={`${kind}-row-label`}
                onClick={() => {
                  touch();
                  const next = rows.map((x, j) => (j === i ? { ...x, label: x.label === "Work" ? "Private" : "Work" } : x));
                  setRows(next);
                  void save(next);
                }}
              >
                {r.label}
              </button>
            ) : kind === "social" && (r.value.trim() || r.label) ? (
              // The platform's small logo in front of its name. It follows the address as it is typed; a site that is not a known
              // platform shows the plain globe.
              <div className="flex items-center gap-1.5" data-testid="social-row-platform">
                {SocialLogo && socialPlatformName ? <SocialLogo platform={socialPlatformName(platformOf(r.value), r.label)} className="text-[var(--ink-soft)]" /> : null}
                {r.label ? (
                  <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]" data-testid={`${kind}-row-label`}>
                    {r.label}
                  </p>
                ) : null}
              </div>
            ) : r.label ? (
              <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]" data-testid={`${kind}-row-label`}>
                {r.label}
              </p>
            ) : null}
            {r.ref ? (
              // A catalogue skill: its name. The referent address is not drawn.
              <div className="mt-0.5 min-w-0" data-testid="skill-row-value">
                <p className="text-[15px] capitalize text-[var(--ink)]">{skillNameOf(r)}</p>
                {skillNotes && SkillDepthNote && (
                  <SkillDepthNote
                    skillName={skillNameOf(r)}
                    note={skillNotes.noteFor(r.ref)}
                    readOnly={!canEdit || !skillNotes.editableFor(r.ref)}
                    saving={skillNotes.savingFor(r.ref)}
                    error={skillNotes.errorFor(r.ref)}
                    onCommit={(next) => skillNotes.save(r.ref!, next)}
                  />
                )}
                {/* Who added the note. */}
                {AddedByLine && skillNotes && skillNotes.sourceFor(r.ref) ? <AddedByLine item={skillNotes.sourceFor(r.ref)!.item} own={skillNotes.sourceFor(r.ref)!.own} hasSource={skillNotes.sourceFor(r.ref)!.hasSource} /> : null}
                {/* Only on a note the viewer added (they have a claim of their own on this skill). */}
                {HeldVisibilitySwitch && skillNotes && skillNotes.markFor(r.ref) !== null && (
                  <HeldVisibilitySwitch
                    isPrivate={skillNotes.markFor(r.ref) === "private"}
                    editing={canEdit}
                    busy={skillNotes.savingFor(r.ref)}
                    noun={`skill ${skillNameOf(r)}`}
                    onSet={(makePrivate) => void skillNotes.setPrivate(r.ref!, makePrivate)}
                  />
                )}
              </div>
            ) : kind === "phone" ? (
              canEdit && PhoneValue ? (
                <PhoneValue
                  startEditing={r.key === justAdded}
                  value={r.value}
                  suggestedDial={suggestedDial}
                  ariaLabel={`Edit ${title}${r.label ? " " + r.label : ""}`}
                  onCommit={(v) => {
                    touch();
                    const next = rows.map((x, j) => (j === i ? { ...x, value: v } : x));
                    setRows(next);
                    void save(next);
                  }}
                />
              ) : (
                <p className="mt-0.5 break-words text-[15px] text-[var(--ink)]" data-testid="phone-row-value">
                  {r.value}
                </p>
              )
            ) : (
              <input
                type={kind === "email" ? "email" : "text"}
                inputMode={kind === "email" ? "email" : "text"}
                value={r.value}
                readOnly={!canEdit}
                placeholder={`Add ${noun}`}
                aria-label={workPrivate ? `${r.label} ${noun}` : `${title}${r.label ? " " + r.label : ""}`}
                data-testid={`${kind}-row-input`}
                autoFocus={r.key === justAdded}
                aria-invalid={badEmail.has(r.key) || undefined}
                className={
                  "mt-0.5 w-full rounded-[var(--r-sm)] border bg-[var(--surface)] px-3 py-2 text-[15px] text-[var(--ink)] " +
                  (badEmail.has(r.key) ? "border-[var(--bad)]" : "border-[var(--line-2)]")
                }
                onChange={(e) => edit(i, { value: e.target.value })}
                onBlur={() => {
                  if (dirty.current) void save(rowsRef.current);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            )}
            {(kind === "email" || kind === "social") && badEmail.has(r.key) && (
              <p role="alert" className="mt-1 text-[12.5px] text-[var(--bad)]" data-testid={`${kind}-row-format`}>
                {kind === "email" ? EMAIL_FORMAT_HINT : WEB_ADDRESS_HINT}
              </p>
            )}
            {!badEmail.has(r.key) && <RowActions kind={kind} value={r.value} />}
          </div>
        </div>
      ))))}
      {allowEdit && (
        <button
          type="button"
          data-testid={`${kind}-add`}
          data-card-add=""
          className="flex min-h-11 items-center gap-2 self-start text-[15px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          onClick={() => {
            // "Add skills" opens the skill picker; a skill is never typed in.
            if (kind === "skill") {
              setPicking(true);
              return;
            }
            const addedKey = nextContactKey(kind, rows);
            setJustAdded(addedKey);
            setRows((rs) => [
              ...rs,
              {
                key: addedKey,
                label: workPrivate ? (rs.some((x) => x.label === "Work") ? "Private" : "Work") : "",
                value: "",
              },
            ]);
          }}
        >
          <span aria-hidden="true" className="text-[18px] text-[var(--good,#3a8a3a)]">⊕</span>{" "}
          {/* The skill control reads "Add skills"; built on the master's label ("Skill"). */}
          {kind === "skill" ? `Add ${noun}s` : `add ${noun}`}
        </button>
      )}
      {skillNotes?.readError && (
        <span role="alert" className="text-[12.5px] text-[var(--bad)]" data-testid="skill-notes-read-error">
          {skillNotes.readError}
        </span>
      )}
      {saving && <span className="text-[12px] text-[var(--ink-faint)]">Saving…</span>}
      {error && !inPlace && (
        <span role="alert" className="text-[12.5px] text-[var(--bad)]">
          {error}
        </span>
      )}
    </CardGroup>
    </>
  );
}

/**
 * One row in PRESENTATION: its sub-label, its value as text (a button, so a click, Enter or Space on it turns edit mode on
 * with this row's box ready for typing), and the action links that value allows. No (−), no input, no placeholder.
 */
function PresentRow({
  kind,
  row: r,
  title,
  workPrivate,
  noun,
  note,
  noteText,
  editable,
  onEnter,
}: {
  kind: ContactKind;
  row: ContactRow;
  title: string;
  workPrivate: boolean;
  noun: string;
  note: ReactNode;
  noteText: string;
  /** The card may be written: the value is a button; otherwise plain text. */
  editable: boolean;
  onEnter: () => void;
}) {
  const { SocialLogo, socialPlatformName } = useContactRowsHost();
  const name = workPrivate ? `${r.label} ${noun}` : `${title}${r.label ? " " + r.label : ""}`;
  const valueText = r.ref ? skillNameOf(r) : r.value;
  const valueCls = "block min-h-10 w-full break-words rounded-[var(--r-sm)] py-1.5 text-left text-[15px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
  return (
    <div className="flex items-start gap-2 py-1" data-testid={`${kind}-row`} data-presentation="true">
      <div className="min-w-0 flex-1">
        {kind === "social" && (r.value.trim() || r.label) ? (
          <div className="flex items-center gap-1.5" data-testid="social-row-platform">
            {SocialLogo && socialPlatformName ? <SocialLogo platform={socialPlatformName(platformOf(r.value), r.label)} className="text-[var(--ink-soft)]" /> : null}
            {r.label ? (
              <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]" data-testid={`${kind}-row-label`}>
                {r.label}
              </p>
            ) : null}
          </div>
        ) : r.label ? (
          <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]" data-testid={`${kind}-row-label`}>
            {r.label}
          </p>
        ) : null}
        {r.ref ? (
          <div className="mt-0.5 min-w-0" data-testid="skill-row-value">
            {editable ? (
              <button type="button" className={valueCls + " capitalize"} aria-label={`Edit ${name} ${valueText}`} data-testid={`${kind}-row-value`} onClick={onEnter}>
                {valueText}
              </button>
            ) : (
              <p className="text-[15px] capitalize text-[var(--ink)]" data-testid={`${kind}-row-value`}>{valueText}</p>
            )}
            {noteText.trim() ? note : null}
          </div>
        ) : editable ? (
          <button type="button" className={valueCls} aria-label={`Edit ${name}`} data-testid={`${kind}-row-value`} onClick={onEnter}>
            {valueText}
          </button>
        ) : (
          <p className="mt-0.5 break-words text-[15px] text-[var(--ink)]" data-testid={`${kind}-row-value`}>{valueText}</p>
        )}
        <RowActions kind={kind} value={r.value} />
      </div>
    </div>
  );
}

/**
 * The links a contact card gives: open a link in a new tab, call or text a phone number, send an email (`tel:`, `sms:`, `mailto:`, an
 * openable social link), built with the `contact-actions` helpers. Shown only for a
 * value that can be acted on: a phone with digits, an address that fits, a web address the app would
 * open (never a bare handle, never a `javascript:` link).
 */
function RowActions({ kind, value }: { kind: ContactKind; value: string }) {
  const v = value.trim();
  if (!v) return null;
  const link = "text-[13px] text-[var(--accent)] underline-offset-2 hover:underline";
  if (kind === "phone") {
    const digits = phoneForUri(v);
    if (!/\d/.test(digits)) return null;
    return (
      <div className="mt-1 flex gap-4" data-testid="phone-row-actions">
        <a href={`tel:${digits}`} className={link} data-testid="phone-row-call">
          Call
        </a>
        <a href={`sms:${digits}`} className={link} data-testid="phone-row-text">
          Text
        </a>
      </div>
    );
  }
  if (kind === "email") {
    if (!isEmailFormat(v.replace(/^mailto:/i, ""))) return null;
    return (
      <div className="mt-1 flex gap-4" data-testid="email-row-actions">
        <a href={toMailtoHref(v)} className={link} data-testid="email-row-send">
          Send email
        </a>
      </div>
    );
  }
  if (kind === "social") {
    const href = resolvableSocialHref(v);
    if (!href) return null;
    return (
      <div className="mt-1 flex gap-4" data-testid="social-row-actions">
        <a href={href} target="_blank" rel="noopener noreferrer" className={link} data-testid="social-row-open">
          Open link ↗
        </a>
      </div>
    );
  }
  return null;
}
