// The signed-in app: the frame, the menu of sections, the vault chip, Share and Sign out.
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ShellFrame, useShellCore } from "@kaigilb/gilbplatformcode-app-shell";
import { listVaults, type ListedVault } from "@kaigilb/gilbplatformcode-signin";
import { VaultShareSheet } from "@kaigilb/gilbplatformcode-vault-share-sheet";
import { useVaultChoice, VaultSwitcher } from "@kaigilb/gilbplatformcode-vault-switcher";
import { loadToldApart } from "./accessList";
import { clearAddress, readAddress, vaultAddressStore, writeAddress } from "./address";
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

/**
 * Closes the frame's open drawer. The frame owns the drawer and gives no call to close it, and drawing the frame again would
 * throw away what the person typed in the open section. The drawer closes on Escape (its own rule for the keyboard), so this
 * sends it one.
 */
function closeDrawer(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

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
}: {
  sections: readonly StarterSection[];
  current: string;
  onPick(id: string): void;
  words: StarterWords;
  account: AccountProps;
}) {
  const { sizeClass } = useShellCore();
  const inDrawer = sizeClass !== "expanded";
  // Below the wide layout the menu is a drawer: after a pick from it, it closes, as a menu does.
  const act = (run: () => void) => () => {
    run();
    if (inDrawer) closeDrawer();
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
  // The open vault and the open section are kept in the page's address, not on the device.
  const choice = useVaultChoice({ listed, ownVaultId: ownVault.vaultId, principal, appKey: settings.appId, represents: settings.vaultType, load, store: vaultAddressStore });
  const [sectionId, setSectionId] = useState(() => {
    const asked = readAddress("section");
    return sections.some((s) => s.id === asked) ? asked! : sections[0]!.id;
  });

  const [sharing, setSharing] = useState(false);
  const shareApi = useMemo(() => ({ load: loadToldApart(words.unnamedRow) }), [words.unnamedRow]);

  const section = sections.find((s) => s.id === sectionId) ?? sections[0]!;
  const open = choice.current;
  // The address says what is open, and only that: the section unless it is the first, the vault unless it is the person's
  // own. An address that named a section or a vault the person does not have is put right as soon as the frame is drawn.
  const firstSectionId = sections[0]!.id;
  useEffect(() => {
    writeAddress("section", section.id === firstSectionId ? null : section.id);
    writeAddress("vault", open.yours ? null : open.vaultId);
  }, [section.id, firstSectionId, open.vaultId, open.yours]);
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
    onSignOut: () => {
      clearAddress();
      onSignOut();
    },
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
        layoutOptions={{ storageKey: `${settings.appId}.shell.layout.v1`, defaults: { leftCollapsed: false, leftW: 240 } }}
        header={<Header appName={settings.appName} chip={chip} viewOnly={choice.canWrite ? null : words.viewOnly} account={account} />}
        left={
          <Menu
            sections={sections}
            current={section.id}
            words={words}
            account={account}
            onPick={setSectionId}
          />
        }
        center={
          <Fragment key={`${open.vaultId}|${section.id}`}>
            {/* The centre scrolls itself and takes the focus, so the keyboard scrolls it in every browser (see the sheet). */}
            <main className="sa-center" tabIndex={0} aria-label={section.label}>
              {section.render(ctx)}
            </main>
          </Fragment>
        }
        {...(section.detail
          ? {
              right: (
                <Fragment key={`${open.vaultId}|${section.id}`}>
                  <section className="sa-detail" tabIndex={0} aria-label={words.detail}>
                    {section.detail(ctx)}
                  </section>
                </Fragment>
              ),
            }
          : {})}
        leftTitle={settings.appName}
        leftLabel={words.menu}
      />
      {sharing ? (
        <VaultShareSheet
          vaultId={open.vaultId}
          title={words.shareTitle(open.label)}
          help={words.shareHelp}
          you={principal}
          api={shareApi}
          words={{ yes: words.removeYes, no: words.removeNo }}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </div>
  );
}
