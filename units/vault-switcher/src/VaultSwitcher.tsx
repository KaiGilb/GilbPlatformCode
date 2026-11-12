import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ModalSheet } from "@kaigilb/gilbplatformcode-modal-sheet";
import { choiceLine, vaultChoices, type VaultListItem } from "@kaigilb/gilbplatformcode-vault-list";
import { defaultWords, type VaultSwitcherWords } from "./words";
import "./vaultSwitcher.css";

export interface VaultSwitcherProps<V extends VaultListItem> {
  /** The open vault: its address (compared exactly) and the name the chip shows. */
  current: { vaultId: string; label: string };
  /** Called each time the sheet opens, and again on Try again. */
  load: () => Promise<readonly V[]>;
  /** True for the person's own vault(s); they are listed first. */
  isYours: (v: V) => boolean;
  /** Called with the vault exactly as `load` gave it. Not called for the open vault. */
  onPick: (v: V) => void;
  /** The app's own art, shown before the name. */
  icon?: ReactNode;
  words?: Partial<VaultSwitcherWords>;
}

type Loaded<V> = { status: "loading" } | { status: "error" } | { status: "ready"; vaults: readonly V[] };

/**
 * A chip with the open vault's name; a tap opens a sheet that lists the vaults the person reaches (own first, shared ones labelled,
 * the open one marked) and calls `onPick` with the one they choose. The chip is always drawn: the app decides whether to render it.
 */
export function VaultSwitcher<V extends VaultListItem>({ current, load, isYours, onPick, icon, words }: VaultSwitcherProps<V>) {
  const w = { ...defaultWords, ...words };
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Loaded<V>>({ status: "loading" });
  // Each load takes a number. Closing takes one too. Only the newest number may write the state.
  const generation = useRef(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => () => void ++generation.current, []);

  const start = useCallback(() => {
    const mine = ++generation.current;
    setState({ status: "loading" });
    let asked: Promise<readonly V[]>;
    try {
      asked = loadRef.current();
    } catch (e) {
      asked = Promise.reject(e);
    }
    asked.then(
      (vaults) => {
        if (mine === generation.current) setState({ status: "ready", vaults });
      },
      () => {
        if (mine === generation.current) setState({ status: "error" });
      },
    );
  }, []);

  const close = () => {
    generation.current++;
    setOpen(false);
  };

  const pick = (v: V) => {
    close();
    if (v.vaultId !== current.vaultId) onPick(v);
  };

  const choices = state.status === "ready" ? vaultChoices(state.vaults, isYours) : [];
  return (
    <>
      <button
        type="button"
        className="vsw-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={w.changeVault(current.label)}
        onClick={() => {
          setOpen(true);
          start();
        }}
      >
        {icon}
        <span className="vsw-name">{current.label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ModalSheet title={w.title} closeLabel={w.close} onClose={close}>
          {state.status === "loading" ? <p className="vsw-note" role="status">{w.loading}</p> : null}
          {state.status === "error" ? (
            <>
              <p className="vsw-error" role="alert">{w.couldNotList}</p>
              <button type="button" className="vsw-retry" onClick={start}>{w.tryAgain}</button>
            </>
          ) : null}
          {state.status === "ready" && choices.length === 0 ? <p className="vsw-note">{w.none}</p> : null}
          {state.status === "ready" && choices.length > 0 ? (
            <ul className="vsw-rows">
              {choices.map((c) => (
                <li key={c.vaultId}>
                  <button
                    type="button"
                    className="vsw-row"
                    aria-current={c.vaultId === current.vaultId ? "true" : undefined}
                    onClick={() => {
                      const v = state.vaults.find((x) => x.vaultId === c.vaultId);
                      if (v) pick(v);
                    }}
                  >
                    <span className="vsw-row-name">{c.label}</span>
                    <span className="vsw-row-line">{choiceLine(c, { yours: w.yours, shared: w.shared, viewOnly: w.viewOnly })}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </ModalSheet>
      ) : null}
    </>
  );
}
