// The signed-in app: the frame, the menu of sections, the vault chip, Share and Sign out.
import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { ShellFrame, useShellCore } from "@kaigilb/gilbplatformcode-app-shell";
import { listVaults, type ListedVault } from "@kaigilb/gilbplatformcode-signin";
import { VaultShareSheet } from "@kaigilb/gilbplatformcode-vault-share-sheet";
import { browserStore } from "@kaigilb/gilbplatformcode-vault-share-sheet/remember-names";
import { useVaultChoice, VaultSwitcher } from "@kaigilb/gilbplatformcode-vault-switcher";
import type { StarterRuntime } from "./start";
import type { StarterContext, StarterSection } from "./StarterApp";
import type { StarterWords } from "./words";

export interface WorkspaceProps {
  runtime: StarterRuntime;
  sections: readonly StarterSection[];
  words: StarterWords;
  /** The person's own vault for this app. */
  ownVault: ListedVault;
  /** Every vault the person reaches, as read at sign-in. */
  listed: readonly ListedVault[];
  principal: string;
  actor: string;
  signal: AbortSignal;
  onSignOut(): void;
}

interface AccountProps {
  words: StarterWords;
  onShare(): void;
  onSignOut(): void;
}

/** The menu is a drawer below the wide layout; the frame owns it, so the menu says when a pick came from the drawer. */
type FromDrawer = boolean;

/**
 * Share and Sign out. They are a toolbar, not the action row of a form or a dialog, so the row check is told to leave them out;
 * the order is still the row's: the main act (Share) on the right.
 */
function AccountButtons({ words, onShare, onSignOut }: AccountProps) {
  return (
    <div className="sa-account-buttons" data-button-row-ignore>
      <button type="button" className="sa-button" onClick={onSignOut}>
        {words.signOut}
      </button>
      <button type="button" className="sa-button sa-button--main" onClick={onShare}>
        {words.share}
      </button>
    </div>
  );
}

/** The header's middle: the app's name, the vault chip and, where there is room, Share and Sign out. */
function Header({ appName, chip, viewOnly, account }: { appName: string; chip: ReactNode; viewOnly: string | null; account: AccountProps }) {
  const { sizeClass } = useShellCore();
  return (
    <>
      <span className="sa-title">{appName}</span>
      {chip}
      {viewOnly ? <span className="sa-badge">{viewOnly}</span> : null}
      <span className="sa-spacer" />
      {sizeClass === "compact" ? null : <AccountButtons {...account} />}
    </>
  );
}

/** The left region: the sections, and on a phone the account buttons the header has no room for. */
function Menu({
  sections,
  current,
  onPick,
  words,
  account,
  onDrawerAct,
}: {
  sections: readonly StarterSection[];
  current: string;
  onPick(id: string): void;
  words: StarterWords;
  account: AccountProps;
  /** Called after an act in the menu, with whether the menu is a drawer now. */
  onDrawerAct(fromDrawer: FromDrawer): void;
}) {
  const { sizeClass } = useShellCore();
  const inDrawer = sizeClass !== "expanded";
  const act = (run: () => void) => () => {
    run();
    onDrawerAct(inDrawer);
  };
  return (
    <div className="sa-menu">
      <nav aria-label={words.sections}>
        <ul className="sa-menu-list">
          {sections.map((s) => (
            <li key={s.id}>
              <button type="button" className="sa-menu-item" aria-current={s.id === current ? "page" : undefined} onClick={act(() => onPick(s.id))}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {sizeClass === "compact" ? (
        <section className="sa-menu-account" aria-label={words.account}>
          <h2 className="sa-menu-heading">{words.account}</h2>
          <AccountButtons {...account} onShare={act(account.onShare)} />
        </section>
      ) : null}
    </div>
  );
}

/** The app once the person's vault is open. Keyed by the person, so nothing of one person is left for the next. */
export function Workspace({ runtime, sections, words, ownVault, listed, principal, actor, signal, onSignOut }: WorkspaceProps) {
  const { settings, credential } = runtime;
  const load = useCallback(() => listVaults(settings.idOrigin, { credential }), [settings.idOrigin, credential]);
  const choice = useVaultChoice({ listed, ownVaultId: ownVault.vaultId, principal, appKey: settings.appId, represents: settings.vaultType, load });
  const [sectionId, setSectionId] = useState(sections[0]!.id);
  const [sharing, setSharing] = useState(false);
  // On a narrow window the menu is a drawer the frame owns. A new key closes it after the person has picked from it.
  const [drawerRound, setDrawerRound] = useState(0);
  const afterMenuAct = useCallback((fromDrawer: boolean) => {
    if (fromDrawer) setDrawerRound((n) => n + 1);
  }, []);
  const names = useMemo(() => browserStore(`${settings.appId}:`), [settings.appId]);

  const section = sections.find((s) => s.id === sectionId) ?? sections[0]!;
  const open = choice.current;
  const ctx: StarterContext = useMemo(
    () => ({
      vault: { vaultId: open.vaultId, label: open.label, yours: open.yours, canWrite: choice.canWrite },
      principal,
      actor,
      signal,
      credential,
      vaultRefused: () => choice.markGone(open.vaultId),
    }),
    [open.vaultId, open.label, open.yours, choice.canWrite, choice.markGone, principal, actor, signal, credential],
  );

  const account: AccountProps = {
    words,
    onShare: () => setSharing(true),
    onSignOut,
  };
  const chip = (
    <VaultSwitcher
      current={{ vaultId: open.vaultId, label: open.label }}
      load={async () => (await choice.refresh()).map((o) => ({ vaultId: o.vaultId, name: o.label, modes: o.viewOnly ? ["read"] : ["read", "write"] }))}
      isYours={(v) => v.vaultId === ownVault.vaultId}
      onPick={(v) => choice.switchTo(v.vaultId)}
    />
  );

  return (
    <div className="sa-app" data-stage="ready">
      <ShellFrame
        key={drawerRound}
        layoutOptions={{ storageKey: `${settings.appId}.shell.layout.v1`, defaults: { leftCollapsed: false, leftW: 240 } }}
        header={<Header appName={settings.appName} chip={chip} viewOnly={choice.canWrite ? null : words.viewOnly} account={account} />}
        left={
          <Menu
            sections={sections}
            current={section.id}
            words={words}
            account={account}
            onPick={setSectionId}
            onDrawerAct={afterMenuAct}
          />
        }
        center={
          <Fragment key={`${open.vaultId}|${section.id}`}>
            <div className="sa-center">{section.render(ctx)}</div>
          </Fragment>
        }
        {...(section.detail ? { right: <Fragment key={`${open.vaultId}|${section.id}`}>{section.detail(ctx)}</Fragment> } : {})}
        leftTitle={settings.appName}
        leftLabel={words.menu}
      />
      {sharing ? (
        <VaultShareSheet vaultId={open.vaultId} title={words.shareTitle(open.label)} help={words.shareHelp} you={principal} rememberNames={names} onClose={() => setSharing(false)} />
      ) : null}
    </div>
  );
}
