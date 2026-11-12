import { ModalSheet } from "@kaigilb/gilbplatformcode-modal-sheet";
import { useEffect, useId, useState, type FormEvent } from "react";
import "./vaultShareSheet.css";
import type { AccessRow, ShareApi, ShareLevel } from "./model";
import { useVaultShare } from "./useVaultShare";
import { defaultWords, type ShareWords } from "./words";

export interface VaultShareSheetProps {
  /** The vault to share: the open one, which the signed-in person owns or holds Control on. */
  vaultId: string;
  /** The heading. Default: the words' `title`. */
  title?: string;
  onClose(): void;
  /** Show the owner (and anyone else holding Control) at the top of the list. Default true. */
  showOwner?: boolean;
  /** The level the radios start on. Default "view". */
  defaultLevel?: ShareLevel;
  words?: Partial<ShareWords>;
  /** Replace any of the three calls (the default talks to the platform through vault-access). */
  api?: Partial<ShareApi>;
}

/** Share a whole vault: type a vault name or address and a level, see who has access, take it away with an inline Yes or No. */
export function VaultShareSheet({ vaultId, title, onClose, showOwner = true, defaultLevel = "view", words, api }: VaultShareSheetProps) {
  const w: ShareWords = { ...defaultWords, ...words };
  const { state, submit, remove, clearMessages } = useVaultShare(vaultId, api);
  const [text, setText] = useState("");
  const [level, setLevel] = useState<ShareLevel>(defaultLevel);
  const [removing, setRemoving] = useState<string | null>(null);
  const ids = useId();
  const { busy, view } = state;
  const notControlled = state.status === "ready" && view !== null && !view.controlled;

  // A share that worked empties the field.
  useEffect(() => {
    if (state.done) setText("");
  }, [state.done]);
  // A person whose row has gone (removed, or removed by someone else) has nothing left to confirm.
  useEffect(() => {
    if (removing !== null && view?.controlled && !view.rows.some((r) => r.principal === removing)) setRemoving(null);
  }, [view, removing]);

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    void submit(text, level);
  };

  const line = (r: AccessRow) => (r.owner ? w.ownerLine : r.level === "edit" ? w.canEdit : w.canView);
  const rowView = (r: AccessRow) => (
    <li key={r.principal} className="vss-row">
      <span className="vss-row-text">
        <span className="vss-row-name">{r.label}</span>
        <span className="vss-row-line">{line(r)}</span>
        {r.note && !r.owner ? <span className="vss-row-note">{r.note}</span> : null}
      </span>
      {r.owner ? null : removing === r.principal ? (
        <span className="vss-inline" role="group" aria-label={w.confirmRemove(r.label)}>
          <span className="vss-confirm">{w.confirmRemove(r.label)}</span>
          <button type="button" className="vss-btn" disabled={busy} onClick={() => setRemoving(null)}>{w.no}</button>
          <button type="button" className="vss-btn vss-danger" disabled={busy} onClick={() => void remove(r.principal)}>{w.yes}</button>
        </span>
      ) : (
        <button type="button" className="vss-btn vss-danger-text" disabled={busy} aria-label={w.removeLabel(r.label)} onClick={() => { setRemoving(r.principal); }}>{w.remove}</button>
      )}
      {state.removeProblem?.principal === r.principal ? <p className="vss-error" role="alert">{state.removeProblem.message}</p> : null}
    </li>
  );

  return (
    <ModalSheet title={title ?? w.title} onClose={onClose} closeLabel={w.close} className="vss">
      {notControlled ? (
        <p className="vss-note" role="status">{w.notControlled}</p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div className="vss-field">
            <label htmlFor={`${ids}-who`} className="vss-label">{w.nameLabel}</label>
            <input
              id={`${ids}-who`}
              className="vss-input"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={w.namePlaceholder}
              value={text}
              disabled={busy}
              aria-invalid={state.submitProblem ? true : undefined}
              onChange={(e) => { setText(e.target.value); clearMessages(); }}
            />
          </div>
          <fieldset className="vss-levels">
            <legend className="vss-label">{w.accessLegend}</legend>
            <label className="vss-radio"><input type="radio" name={`${ids}-level`} checked={level === "edit"} disabled={busy} onChange={() => setLevel("edit")} /> {w.canEdit}</label>
            <label className="vss-radio"><input type="radio" name={`${ids}-level`} checked={level === "view"} disabled={busy} onChange={() => setLevel("view")} /> {w.canView}</label>
          </fieldset>
          {state.submitProblem ? <p className="vss-error" role="alert">{state.submitProblem}</p> : null}
          {state.done ? <p className="vss-note" role="status">{w.shared(state.done.name)}</p> : null}
          <div className="vss-actions"><button type="submit" className="vss-btn vss-primary" disabled={busy}>{w.share}</button></div>
        </form>
      )}

      {notControlled ? null : <h3 className="vss-sub">{w.whoHasAccess}</h3>}
      {state.status === "loading" ? <p className="vss-note" role="status">{w.loading}</p> : null}
      {state.status === "error" ? <p className="vss-error" role="alert">{state.error}</p> : null}
      {view?.controlled ? (
        <>
          {view.rows.length === 0 ? <p className="vss-note">{w.nobody}</p> : null}
          <ul className="vss-rows">
            {showOwner && view.owner ? rowView(view.owner) : null}
            {view.rows.map(rowView)}
          </ul>
        </>
      ) : null}
    </ModalSheet>
  );
}
