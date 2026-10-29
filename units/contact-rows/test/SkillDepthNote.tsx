// A copy of the app's SkillDepthNote (src/components/mynet/SkillDepthNote.tsx lines 22-125), used by the tests as the host's member.
import { useEffect, useRef, useState } from "react";

export function SkillDepthNote({
  skillName,
  note,
  readOnly,
  saving,
  error,
  onCommit,
  noun = "skill",
}: {
  /** The skill's name, for the controls' accessible names (MyNet: `field.value`). */
  skillName: string;
  /** The stored note ("" for none), or null while it is not read. */
  note: string | null;
  readOnly: boolean;
  saving: boolean;
  error: string | null;
  /** Save the note; resolves TRUE only when the store kept it. */
  onCommit: (next: string) => Promise<boolean>;
  /** What the note is about: "skill" (MyNet's words) or "interest". */
  noun?: "skill" | "interest";
}) {
  const tid = noun === "skill" ? "skill-depth-note" : "interest-note";
  /** Counts commits: only the latest one's answer may clear the unconfirmed text (Delta7 B1, P4). */
  const commits = useRef(0);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  /** A committed note the store has not confirmed: shown in place of the stored one, never dropped. */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const shown = unconfirmed ?? note ?? "";

  useEffect(() => {
    if (!editingNote) setNoteDraft(shown);
  }, [shown, editingNote]);

  if (note === null && unconfirmed === null) return null;
  if (readOnly && !shown) return null;

  const commit = (next: string) => {
    const mine = ++commits.current;
    setUnconfirmed(next);
    void onCommit(next).then((kept) => {
      if (kept && mine === commits.current) setUnconfirmed(null);
    });
  };

  return (
    <div className="mt-1 flex items-start gap-2" data-testid={tid}>
      <div className="min-w-0 flex-1">
        <p className="font-[var(--serif)] text-[12px] italic text-[var(--ink-soft)]">About this {noun}</p>
        {readOnly ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-[var(--ink)]" data-testid={`${tid}-text`}>
            {shown}
          </p>
        ) : editingNote ? (
          <textarea
            className="mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[16px] text-[var(--ink)]"
            rows={3}
            value={noteDraft}
            placeholder="Go into more depth — level, context, examples…"
            aria-label={`About ${skillName}`}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => {
              setEditingNote(false);
              const next = noteDraft.trim();
              if (next !== shown.trim()) commit(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNoteDraft(shown);
                setEditingNote(false);
              }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="mt-0.5 block w-full break-words text-left text-[14px] text-[var(--ink)]"
            onClick={() => {
              setNoteDraft(shown);
              setEditingNote(true);
            }}
            aria-label={`Edit note for ${skillName}`}
            data-testid={`${tid}-text`}
          >
            {shown ? (
              <span className="whitespace-pre-wrap">{shown}</span>
            ) : (
              <span className="text-[var(--ink-ghost)]">Add a note about this {noun}</span>
            )}
          </button>
        )}
        {saving && <span className="text-[12px] text-[var(--ink-faint)]">Saving…</span>}
        {error && (
          <p role="alert" className="mt-1 text-[12.5px] text-[var(--bad)]" data-testid={`${tid}-error`}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
