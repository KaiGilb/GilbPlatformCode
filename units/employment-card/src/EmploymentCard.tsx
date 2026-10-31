/**
 * One person's employments as a framed group: for each, the company (the organization search), the role's date line ("Aug 2025 – Present ·
 * 1 yr 2 mos"), From / To month pickers and "Present", then each title; "add job title" within an employment and "add employment" for a new
 * block. In the card's PRESENTATION mode an employment reads as text, a blank one is not drawn, and a tap turns edit mode on. The add and
 * remove controls show only in edit mode. The card writes through the editor it is given and does nothing else.
 *
 *   - THE WORK PLACE IS A SLOT. `renderWorkLocation` (the edit control) and `renderPlaceName` (the read-only name) are optional. Absent, no
 *     place is drawn and no Location box; a stored place is carried unchanged by every save of the role (the role handed back names the place
 *     it was given, so nothing is changed or cleared). The card imports no place catalogue;
 *   - A COMPANY AND A ROLE SHOW BY NAME. A stored value that is an address (another writer left one) is drawn as "A company" / "A role", never
 *     as the address;
 *   - UNKNOWN IS NOT EMPTY. With `vaultUnknown` the card says the employments are not shown because their vault is not known; after a failed
 *     read it says so and offers no add box (a first entry is not invited over a list that could not be read);
 *   - MOUNT, RENDER, IDLE and a change of `editMode` write nothing: a write is a click, a blur of a changed text, or Enter.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CompanySearch, type CompanyFind } from "@kaigilb/gilbplatformcode-company-search";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { formatRoleWhen } from "@kaigilb/gilbplatformcode-role-when";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import type { EmploymentsEditor, FieldSaveStatus } from "@kaigilb/gilbplatformcode-employments-state";

/** What the Location control is handed: the place as stored (an address, and a label that may be empty) and the act of choosing another. */
export interface WorkLocationSlotProps {
  placeId: string;
  placeLabel: string;
  onChange: (next: { placeId: string; placeLabel: string }) => void;
}
/** What the read-only place name is handed. */
export interface PlaceNameSlotProps {
  placeId: string;
  placeLabel: string;
}
export type RenderWorkLocation = (p: WorkLocationSlotProps) => ReactNode;
export type RenderPlaceName = (p: PlaceNameSlotProps) => ReactNode;

/** True for a value that is an address (a link or a compact entity id), which a person must never be shown. */
function looksLikeAddress(text: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text.trim()) || /^base:e\//i.test(text.trim());
}
/** A company by name: the stored text, or "A company" when the text is an address. */
const companyName = (text: string): string => (looksLikeAddress(text) ? "A company" : text);
/** A role (a job title) by name: the stored text, or "A role" when the text is an address. */
const roleName = (text: string): string => (looksLikeAddress(text) ? "A role" : text);

function MonthYear({
  value,
  onPick,
  label,
  disabled,
}: {
  value: string;
  onPick: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = value
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
        new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1),
      )
    : "month – year";
  return (
    <label className={`relative block min-h-11 ${disabled ? "opacity-50" : ""}`}>
      <span
        className={`flex min-h-11 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-base ${
          value ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"
        }`}
      >
        {shown}
      </span>
      <input
        ref={ref}
        type="month"
        value={value}
        disabled={disabled}
        aria-label={label}
        inputMode="none"
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(e) => onPick(e.target.value)}
        onClick={(e) => {
          const el = e.currentTarget;
          if (disabled) return;
          if (typeof el.showPicker === "function") {
            try {
              el.showPicker();
            } catch {
              /* the tap on the control itself still opens the phone picker */
            }
          }
        }}
      />
    </label>
  );
}

export function RoleWhen({
  start,
  end,
  current,
  placeId,
  placeLabel,
  onCommit,
  readOnly,
  renderWorkLocation,
  renderPlaceName,
}: {
  start: string;
  end: string;
  current: boolean | null;
  placeId: string;
  placeLabel: string;
  onCommit: (role: {
    start: string;
    end: string;
    current: boolean | null;
    placeId: string;
    placeLabel: string;
  }) => void;
  /** The record may not be written: the date line and the place only. */
  readOnly?: boolean;
  /** The edit control of the work place. Absent: no Location box; the stored place is carried unchanged by every commit. */
  renderWorkLocation?: RenderWorkLocation;
  /** The read-only name of the work place. Absent: no place is drawn. */
  renderPlaceName?: RenderPlaceName;
}) {
  const [startDraft, setStartDraft] = useState(start);
  const [endDraft, setEndDraft] = useState(end);
  const [present, setPresent] = useState<boolean | null>(current);
  const [place, setPlace] = useState({ placeId, placeLabel });
  useEffect(() => {
    setStartDraft(start);
    setEndDraft(end);
    setPresent(current);
    setPlace({ placeId, placeLabel });
  }, [start, end, current, placeId, placeLabel]);
  const line = formatRoleWhen(startDraft, present === true ? "" : endDraft, present === true);
  const commit = (next: {
    start: string;
    end: string;
    present: boolean | null;
    placeId: string;
    placeLabel: string;
  }) => {
    onCommit({
      start: next.start,
      end: next.present === true ? "" : next.end,
      current: next.present,
      placeId: next.placeId,
      placeLabel: next.placeLabel,
    });
  };
  if (readOnly) {
    const placeShown = !!renderPlaceName && !!place.placeId;
    return line || placeShown ? (
      <div className="mt-2 flex flex-col gap-1" data-testid="experience-role">
        {line ? <p className="text-sm text-[var(--ink-soft)]">{line}</p> : null}
        {placeShown ? renderPlaceName({ placeId: place.placeId, placeLabel: place.placeLabel }) : null}
      </div>
    ) : null;
  }
  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="experience-role">
      {line ? <p className="text-sm text-[var(--ink-soft)]">{line}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--ink-soft)]">From</span>
          <MonthYear
            value={startDraft}
            label="Role start"
            onPick={(value) => {
              setStartDraft(value);
              commit({ start: value, end: endDraft, present, ...place });
            }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--ink-soft)]">To</span>
          <MonthYear
            value={present === true ? "" : endDraft}
            label="Role end"
            disabled={present === true}
            onPick={(value) => {
              setEndDraft(value);
              commit({ start: startDraft, end: value, present, ...place });
            }}
          />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-base text-[var(--ink)]">
        <input
          type="checkbox"
          className="size-5"
          checked={present === true}
          aria-label="Role is current"
          onChange={(e) => {
            const on = e.target.checked;
            setPresent(on);
            if (on) setEndDraft("");
            commit({ start: startDraft, end: on ? "" : endDraft, present: on, ...place });
          }}
        />
        Present
      </label>
      {renderWorkLocation
        ? renderWorkLocation({
            placeId: place.placeId,
            placeLabel: place.placeLabel,
            onChange: (next) => {
              setPlace(next);
              commit({ start: startDraft, end: endDraft, present, ...next });
            },
          })
        : null}
    </div>
  );
}

/** MyNet `EditableText`: tap the value, it edits in place; blur/Enter saves, Escape reverts. */
function EditableText({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  emphasis,
  disabled,
  startEditing = false,
}: {
  /** GilbApp (Kai 2026-10-14): a title just added opens at once with the cursor in it. */
  startEditing?: boolean;
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Company reads slightly stronger than its titles. */
  emphasis?: boolean;
  /** GilbApp: the record may not be written. */
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onCommit(next);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  // 🔴 16px, ⛔ never below (MyNet Cycle160 D24): a text input that auto-focuses on tap zooms mobile
  // Safari below 16px.
  const textCls = emphasis ? "text-[16px] font-medium text-[var(--ink)]" : "text-[16px] text-[var(--ink)]";

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        aria-label={ariaLabel}
        className={`mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 ${textCls}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`mt-0.5 block w-full break-words text-left disabled:cursor-default ${textCls}`}
      disabled={disabled}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      aria-label={ariaLabel}
    >
      {value ? value : <span className="font-normal text-[var(--ink-faint)]">{placeholder}</span>}
    </button>
  );
}

// s8 card UX (Kai's walk 2): MyNet's `DeleteHandle` is the red round (−); here it is MyNet's `RemoveControl`
// itself (the same circle-minus, the same `mt-6` nudge to sit by the value under the sub-label).
function DeleteHandle({ label, onClick }: { label: string; onClick: () => void }) {
  return <RemoveControl className="mt-6" label={label} onClick={onClick} />;
}

function QuickAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="mt-1 flex min-h-11 items-center gap-2 self-start text-[15px] text-[var(--ink)]" onClick={onClick}>
      <span aria-hidden="true" className="text-[18px] text-[var(--good,#3a8a3a)]">
        ⊕
      </span>{" "}
      {label}
    </button>
  );
}

function SaveBadge({ status, onRetry }: { status?: FieldSaveStatus; onRetry: () => void }) {
  if (status === "saving") return <span className="text-[11px] text-[var(--ink-faint)]">saving</span>;
  if (status === "saved") return <span className="text-[11px] text-[var(--accent)]">saved</span>;
  if (status === "failed")
    return (
      <button type="button" className="text-[11px] font-medium text-[var(--bad)]" onClick={onRetry} aria-label="Not saved — retry">
        not saved · retry
      </button>
    );
  return null;
}

/**
 * Experience (Kai 2026-09-27): one company, then each title with its dates and place.
 */
export function EmploymentCard({
  title,
  editor,
  editMode: editModeProp,
  recordsVaultId = null,
  vaultName,
  find,
  vaultUnknown = false,
  renderWorkLocation,
  renderPlaceName,
}: {
  /** The master's label for the `a/employment` term. */
  title: string;
  editor: EmploymentsEditor;
  editMode: boolean;
  /** The vault whose ORGANIZATION RECORDS the company chooser offers (an employment then also names the record, `a:employer`). Null: no vault is known; nothing is searched. */
  recordsVaultId?: string | null;
  /** The name of that vault, as the person knows it (the chooser names it when it says what it searched). Absent: "this vault". */
  vaultName?: string;
  /** The finder of organization records in one vault. */
  find: CompanyFind;
  /** The record names employments but the vault that holds them is not known: they were not read, and the card says so. */
  vaultUnknown?: boolean;
  /** The edit control of an employment's work place. Absent: no Location box, and a stored place is carried unchanged by every save. */
  renderWorkLocation?: RenderWorkLocation;
  /** The read-only name of an employment's work place. Absent: no place is drawn. */
  renderPlaceName?: RenderPlaceName;
}) {
  const { employments } = editor;
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  /** The add and remove controls are editing controls: they show only in edit mode, whatever the host passed. */
  const editMode = editModeProp && !present;
  /** What presentation shows: an employment with a company, a title or a role. A blank one is not drawn. */
  const hasContent = (emp: (typeof employments)[number]) =>
    !!emp.company.trim() || emp.titles.some((t) => t.value.trim()) || !!(emp.role && (emp.role.start || emp.role.end || emp.role.current || (renderPlaceName && emp.role.placeId)));
  // GilbApp (Kai 2026-10-14: "When pressing + … it needs to auto place the cursor in the next step"):
  // the employment or title just added opens ready for typing. Remember which keys existed before
  // the press; the new one is the one that was not there.
  const [focusNew, setFocusNew] = useState<{ kind: "emp" } | { kind: "title"; empKey: string; before: string[] } | null>(null);
  const [empsBefore, setEmpsBefore] = useState<string[]>([]);
  return (
    <CardGroup
      kind="employment"
      testId="employment-rows"
      title={title}
      icon="employment"
      empty={!employments.some(hasContent) && editor.legacyText.length === 0 && editor.unresolved.length === 0 && !editor.error && !vaultUnknown}
    >
      {/* A failed read withholds the add box: the screen does not invite a first entry over a list it could not read. */}
      {employments.length === 0 && editMode && !editor.loading && !editor.error ? (
        <div className="py-1.5" data-testid="employment-section-default">
          <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">Company</p>
          <CompanySearch
            value=""
            recordsVaultId={recordsVaultId}
            vaultName={vaultName}
            find={find}
            onUseRecord={(hit) => editor.addEmployment({ company: hit.name, employer: { uri: hit.uri } })}
            onUseName={(name) => {
              editor.addEmployment({ company: name });
            }}
          />
        </div>
      ) : null}
      {vaultUnknown ? (
        <p className="text-[12.5px] text-[var(--ink-faint)]" data-testid="employment-vault-unknown">
          Employment is stored in a vault that is not known here, so it is not shown. This is not a statement that there is none.
        </p>
      ) : null}
      {employments.map((emp, i) => present && !hasContent(emp) ? null : present ? (
        <div
          key={emp.key}
          data-field-key={`emp:${emp.key}`}
          data-testid="employment-row"
          data-presentation="true"
          className="py-1"
        >
          {emp.company.trim() ? (
            <>
              <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">Company</p>
              {mode.canEdit ? (
                <button
                  type="button"
                  className="block min-h-10 w-full rounded-[var(--r-sm)] py-1.5 text-left text-[15px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  aria-label={`Edit employment ${companyName(emp.company)}`}
                  data-testid="employment-company-value"
                  onClick={mode.enter}
                >
                  {companyName(emp.company)}
                </button>
              ) : (
                <p className="text-[15px] text-[var(--ink)]" data-testid="employment-company-value">{companyName(emp.company)}</p>
              )}
            </>
          ) : null}
          <RoleWhen
            start={emp.role?.start ?? ""}
            end={emp.role?.end ?? ""}
            current={emp.role ? emp.role.current : null}
            placeId={emp.role?.placeId ?? ""}
            placeLabel={emp.role?.placeLabel ?? ""}
            readOnly
            renderPlaceName={renderPlaceName}
            onCommit={() => undefined}
          />
          {emp.titles.filter((t) => t.value.trim()).map((t) => (
            <div key={t.key} className="pt-1.5">
              <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">Title</p>
              {mode.canEdit ? (
                <button
                  type="button"
                  className="block min-h-10 w-full rounded-[var(--r-sm)] py-1.5 text-left text-[15px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  aria-label={`Edit job title ${roleName(t.value)}`}
                  data-testid="employment-title-value"
                  onClick={mode.enter}
                >
                  {roleName(t.value)}
                </button>
              ) : (
                <p className="text-[15px] text-[var(--ink)]" data-testid="employment-title-value">{roleName(t.value)}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          key={emp.key}
          data-field-key={`emp:${emp.key}`}
          data-testid="employment-row"
          className="py-2"
        >
          <div className="flex items-start gap-2 py-1.5">
            {editMode ? (
              <DeleteHandle label={`Remove employment ${companyName(emp.company) || i + 1}`} onClick={() => editor.deleteEmployment(emp.key)} />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">Company</p>
              <CompanySearch
                value={companyName(emp.company)}
                startEditing={focusNew?.kind === "emp" && !empsBefore.includes(emp.key) && !emp.company}
                disabled={!editMode}
                recordsVaultId={recordsVaultId}
                vaultName={vaultName}
                find={find}
                onUseRecord={(hit) => editor.editEmploymentCompany(emp.key, hit.name, { uri: hit.uri })}
                onUseName={(name) => editor.editEmploymentCompany(emp.key, name)}
              />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <SaveBadge status={editor.status[`emp:${emp.key}`]} onRetry={editor.retryOutbox} />
            </div>
          </div>
          <RoleWhen
            start={emp.role?.start ?? ""}
            end={emp.role?.end ?? ""}
            current={emp.role ? emp.role.current : null}
            placeId={emp.role?.placeId ?? ""}
            placeLabel={emp.role?.placeLabel ?? ""}
            readOnly={!editMode}
            renderWorkLocation={renderWorkLocation}
            renderPlaceName={renderPlaceName}
            onCommit={(role) => editor.editEmploymentRole(emp.key, role)}
          />

          {/* Job titles — one or more. */}
          {emp.titles.map((t) => (
            <div key={t.key} className="flex items-start gap-2 py-1.5 pl-1">
              {editMode ? <DeleteHandle label="Remove Job title" onClick={() => editor.deleteJobTitle(emp.key, t.key)} /> : null}
              <div className="min-w-0 flex-1">
                <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">Title</p>
                <EditableText
                  value={roleName(t.value)}
                  startEditing={
                    focusNew?.kind === "title" && focusNew.empKey === emp.key && !focusNew.before.includes(t.key) && !t.value
                  }
                  onCommit={(v) => editor.editJobTitle(emp.key, t.key, v)}
                  placeholder="Add title"
                  ariaLabel="Edit Employment Job title"
                  disabled={!editMode}
                />
              </div>
              <SaveBadge status={editor.status[`emp:${emp.key}:${t.key}`]} onRetry={editor.retryOutbox} />
            </div>
          ))}
          {editMode ? (
            <QuickAdd
              label="add job title"
              onClick={() => {
                setFocusNew({ kind: "title", empKey: emp.key, before: emp.titles.map((x) => x.key) });
                editor.addJobTitle(emp.key);
              }}
            />
          ) : null}
        </div>
      ))}
      {editMode && !editor.error ? (
        <QuickAdd
          label="add employment"
          onClick={() => {
            setEmpsBefore(employments.map((x) => x.key));
            setFocusNew({ kind: "emp" });
            editor.addEmployment();
          }}
        />
      ) : null}
      {editor.legacyText.map((text, i) => (
        // F23 (Agent.Scaling ae4292a): a plain-text value another writer left under the term, shown as
        // Address shows a legacy text address: as it is, kept as stored, not edited here.
        <p key={`legacy-${i}`} className="py-1.5 text-[15px] text-[var(--ink)] break-words" data-testid="employment-legacy-text">
          {text}
        </p>
      ))}
      {editor.unresolved.length > 0 ? (
        <p className="text-[12.5px] text-[var(--ink-faint)]" data-testid="employment-unresolved">
          {editor.unresolved.length === 1
            ? "One employment this record links to could not be read. It is kept as stored."
            : `${editor.unresolved.length} employments this record links to could not be read. They are kept as stored.`}
        </p>
      ) : null}
      {editor.error ? (
        <span role="alert" className="text-[12.5px] text-[var(--bad)]">
          {editor.error}
        </span>
      ) : null}
    </CardGroup>
  );
}
