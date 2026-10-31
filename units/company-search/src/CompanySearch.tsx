/**
 * The company box of an employment. Tap the company, type, and the organization RECORDS of one vault that match are listed; a pick
 * names the record, and the typed name can always be used as it is.
 *
 *   - The box searches ONE vault: the one it is given (`recordsVaultId`) and names (`vaultName`, else "this vault"). The records of
 *     any other vault, and every directory of organizations, are not asked, and nothing here says or implies they were;
 *   - A miss is said only when the answer is complete: "No organization record named “X” in <vault>." An answer that says it is
 *     not complete, a search that failed, and a box with no vault to ask each say THAT, and none says there is no such company;
 *   - the typed name can be used in every state: it is a statement about the name, not about the world.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

/** One organization record the finder offers. */
export interface CompanyHit {
  uri: string;
  label: string;
}

/** What the finder answers: the hits, and whether they are all there are (`complete: false`: the list is a floor, not the whole). */
export interface CompanyFound {
  hits: readonly CompanyHit[];
  complete: boolean;
}

export type CompanyFind = (vaultId: string, text: string) => Promise<CompanyFound>;

/** The word for a vault that has no name of its own to give. */
const THIS_VAULT = "this vault";

export function CompanySearch({
  value,
  onUseName,
  ariaLabel = "Edit Employment Company",
  disabled,
  startEditing = false,
  recordsVaultId = null,
  vaultName,
  find,
  onUseRecord,
}: {
  /** The vault whose organization records are searched. Null: no vault is known, nothing is searched, and the box says so. */
  recordsVaultId?: string | null;
  /** The name of that vault, as the person knows it. Absent or blank: "this vault". It is never an address. */
  vaultName?: string;
  /** The finder of organization records in one vault. */
  find: CompanyFind;
  /** A record was chosen: the caller writes the record and the name in one act. */
  onUseRecord?: (hit: { uri: string; name: string }) => void;
  /** An employment just added opens its company search at once, cursor in the box. */
  startEditing?: boolean;
  value: string;
  /** The name that shows on the employment. */
  onUseName: (name: string) => void;
  ariaLabel?: string;
  /** The record may not be written: the company shows read-only. */
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const [debounced, setDebounced] = useState("");
  const asked = vaultName?.trim() ? vaultName.trim() : THIS_VAULT;

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(draft.trim()), 250);
    return () => window.clearTimeout(t);
  }, [draft]);

  const recordsFound = useQuery({
    queryKey: ["company-search", "records", recordsVaultId ?? "", debounced] as const,
    queryFn: () => find(recordsVaultId!, debounced),
    enabled: editing && debounced.length > 0 && !!recordsVaultId,
    staleTime: 10_000,
    retry: false,
  });

  const hits: readonly CompanyHit[] = recordsVaultId ? (recordsFound.data?.hits ?? []) : [];
  const searching = recordsVaultId ? recordsFound.isFetching : false;
  const settled = !searching && debounced.length > 0 && debounced === draft.trim();
  const searchFailed = !!recordsVaultId && recordsFound.isError;
  const answered = !!recordsVaultId && !recordsFound.isError && recordsFound.data !== undefined;
  // Anything but an explicit `complete: true` is read as not complete: the list is then a floor, never the whole.
  const incomplete = answered && recordsFound.data!.complete !== true;
  const complete = answered && recordsFound.data!.complete === true;
  const notMade = !recordsVaultId;

  function choose(hit: CompanyHit) {
    // A record pick names the record and the name in ONE act; the caller writes both.
    if (recordsVaultId && onUseRecord) onUseRecord({ uri: hit.uri, name: hit.label });
    else onUseName(hit.label);
    setEditing(false);
  }

  function useTyped() {
    const typed = draft.trim();
    if (!typed) return;
    onUseName(typed);
    setEditing(false);
  }

  const textCls = "mt-0.5 w-full text-left text-[16px] font-medium text-[var(--ink)]";

  if (!editing) {
    return (
      <button
        type="button"
        className={`${textCls} block break-words disabled:cursor-default`}
        aria-label={ariaLabel}
        data-testid="company-search-closed"
        // An EMPTY company box is the way to add the first one; the pick from "+ Add information" presses it (`CardGroup`).
        {...(value ? {} : { "data-card-add": "" })}
        disabled={disabled}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value ? value : <span className="font-normal text-[var(--ink-faint)]">Add company</span>}
      </button>
    );
  }

  const typedButton =
    settled && (hits.length === 0 || incomplete || searchFailed || notMade) ? (
      <button
        type="button"
        className="min-h-11 text-left text-sm font-medium text-[var(--accent)] underline"
        data-testid="company-use-typed"
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={useTyped}
      >
        Use “{debounced}” as typed
      </button>
    ) : null;

  return (
    <div className="flex flex-col gap-2" data-testid="company-search">
      <input
        aria-label={ariaLabel}
        className={`${textCls} rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5`}
        value={draft}
        placeholder="Add company"
        autoFocus
        autoComplete="off"
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if (e.key !== "Enter") return;
          const exact = hits.find((g) => g.label.toLowerCase() === draft.trim().toLowerCase());
          if (exact) {
            e.preventDefault();
            choose(exact);
          }
        }}
      />
      {searching ? <p className="text-xs text-[var(--ink-faint)]">Searching companies…</p> : null}
      {searchFailed && settled ? (
        <p className="text-xs text-[var(--bad)]" role="alert" data-testid="company-search-failed">
          The search of {asked} could not be made. This is not a statement that there is no such company.
        </p>
      ) : null}
      {notMade && settled ? (
        <p className="text-xs text-[var(--ink-faint)]" data-testid="company-search-not-made">
          No vault is known here, so no organization record was searched. This is not a statement that there is no such company.
        </p>
      ) : null}
      {hits.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="company-search-hits">
          {hits.map((g) => (
            <li key={g.uri}>
              <button
                type="button"
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-2 text-left text-sm text-[var(--ink)]"
                data-testid={`company-search-hit-${g.uri}`}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => choose(g)}
              >
                {g.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {incomplete && settled ? (
        <div className="flex flex-col gap-1" data-testid="company-search-incomplete">
          <p className="text-xs text-[var(--ink-soft)]">
            Not every record in {asked} was searched. This is not a statement that there is no such company.
          </p>
          <button
            type="button"
            className="min-h-11 self-start text-left text-sm font-medium text-[var(--accent)] underline"
            data-testid="company-search-retry"
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => void recordsFound.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {complete && settled && hits.length === 0 ? (
        <p className="text-xs text-[var(--ink-soft)]" data-testid="company-search-miss">
          No organization record named “{debounced}” in {asked}.
        </p>
      ) : null}
      {typedButton}
    </div>
  );
}
