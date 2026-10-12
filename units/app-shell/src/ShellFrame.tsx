// ShellFrame: the frame of an app, with the host's content in its regions.
//
// The render half of an app shell only: the top bar with its two outer pane toggles, then
//   - expanded (>= 840 px): the three resizable regions (the `panes` unit);
//   - compact and medium (< 840 px): the centre alone, a fixed bottom bar, and the left and right
//     regions as slide-over drawers (the `drawer` unit). The bottom bar sits above the drawers, so
//     the same button opens and closes its drawer.
// The host fills the regions and the header's middle; the frame owns only where they go. What a
// section is, what a vault is, and what is signed in stay in the host.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Overlay } from "@kaigilb/gilbplatformcode-drawer";
import { Panes } from "@kaigilb/gilbplatformcode-panes";
import { useWindowSizeClass } from "@kaigilb/gilbplatformcode-size-class";
import { PanelLeftIcon, PanelRightIcon } from "./PanelIcons";
import { ShellCoreContext, type ShellCoreValue } from "./ShellCore";
import { useShellLayout, type ShellLayoutOptions } from "./useShellLayout";

export interface ShellFrameProps {
  /** localStorage key and limits for the three-pane layout. One key per app. */
  layoutOptions: ShellLayoutOptions;
  /** The header's middle (wordmark, search, account). Omit for no header. */
  header?: ReactNode;
  /** The left region (selection, agent). Omit for none: no toggle or drawer is drawn. */
  left?: ReactNode;
  /** The centre region. */
  center: ReactNode;
  /** The right region (detail, commands). Omit for none. */
  right?: ReactNode;
  /** Drawer titles below expanded width. */
  leftTitle?: string;
  rightTitle?: string;
  /** Bottom-bar labels below expanded width. */
  leftLabel?: string;
  rightLabel?: string;
  /** Extra bottom-bar buttons, between the two pane buttons (e.g. Search). */
  bottomExtras?: ReactNode;
}

/** The frame. Children read the core through `useShellCore()`. */
export function ShellFrame({
  layoutOptions,
  header,
  left,
  center,
  right,
  leftTitle = "Workspace",
  rightTitle = "Detail",
  leftLabel = "Selection",
  rightLabel = "Detail",
  bottomExtras,
}: ShellFrameProps) {
  const sizeClass = useWindowSizeClass();
  const isExpanded = sizeClass === "expanded";
  const layout = useShellLayout(layoutOptions);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const hasLeft = left !== undefined;
  const hasRight = right !== undefined;
  const closeLeftDrawer = useCallback(() => setLeftOpen(false), []);
  const closeRightDrawer = useCallback(() => setRightOpen(false), []);

  // The drawers belong to the narrow layout. Going wide closes them, so a drawer left open does
  // not reappear, and take focus, the next time the window narrows.
  useEffect(() => {
    if (!isExpanded) return;
    setLeftOpen(false);
    setRightOpen(false);
  }, [isExpanded]);

  // At expanded width the right pane is governed by the layout; below it by the drawer state.
  // One function per act, so no caller has to remember which.
  const openDetail = useCallback(() => {
    if (isExpanded) layout.expandRight();
    else {
      setLeftOpen(false);
      setRightOpen(true);
    }
  }, [isExpanded, layout]);
  const closeDetail = useCallback(() => {
    if (isExpanded) layout.collapseRight();
    else setRightOpen(false);
  }, [isExpanded, layout]);
  const detailOpen = hasRight && (isExpanded ? !layout.rightCollapsed : rightOpen);

  const core: ShellCoreValue = useMemo(
    () => ({ sizeClass, layout, detailOpen, openDetail, closeDetail }),
    [sizeClass, layout, detailOpen, openDetail, closeDetail],
  );

  return (
    <ShellCoreContext.Provider value={core}>
      <div className="h-full flex flex-col bg-[var(--paper)]" data-size-class={sizeClass}>
        {header !== undefined && (
          <header className="flex-none flex items-center gap-2 md:gap-3 h-14 px-3 md:px-4 border-b border-[var(--line-2)] bg-[color-mix(in_srgb,var(--surface)_72%,var(--paper-2))]">
            {isExpanded && hasLeft && (
              <button
                onClick={layout.toggleLeft}
                aria-label={layout.leftCollapsed ? "Show selection panel" : "Hide selection panel"}
                aria-pressed={!layout.leftCollapsed}
                className="h-12 w-12 min-h-[48px] min-w-[48px] grid place-items-center rounded-[var(--r-md)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--sel)]"
              >
                <PanelLeftIcon size={36} open={!layout.leftCollapsed} />
              </button>
            )}
            <div className="flex-1 min-w-0 flex items-center gap-2 md:gap-3">{header}</div>
            {isExpanded && hasRight && (
              <button
                onClick={layout.toggleRight}
                aria-label={layout.rightCollapsed ? "Show detail panel" : "Hide detail panel"}
                aria-pressed={!layout.rightCollapsed}
                className="h-12 w-12 min-h-[48px] min-w-[48px] grid place-items-center rounded-[var(--r-md)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--sel)]"
              >
                <PanelRightIcon size={36} open={!layout.rightCollapsed} />
              </button>
            )}
          </header>
        )}

        <div className="flex-1 min-h-0">
          {isExpanded ? (
            <Panes
              layout={{
                ...layout,
                leftCollapsed: !hasLeft || layout.leftCollapsed,
                rightCollapsed: !hasRight || layout.rightCollapsed,
              }}
              left={left}
              center={<div className="h-full min-h-0">{center}</div>}
              right={right}
            />
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0 overflow-auto" data-region="center">{center}</div>
              {(hasLeft || hasRight || bottomExtras !== undefined) && (
                <nav
                  className="flex-none relative z-[60] flex items-stretch h-16 border-t border-[var(--line-2)] bg-[var(--paper-2)]"
                  aria-label="Panels"
                >
                  {hasLeft && (
                    <BottomButton
                      glyph={<PanelLeftIcon size={24} open={leftOpen} />}
                      label={leftLabel}
                      active={leftOpen}
                      onClick={() => {
                        setRightOpen(false);
                        setLeftOpen((o) => !o);
                      }}
                    />
                  )}
                  {bottomExtras}
                  {hasRight && (
                    <BottomButton
                      glyph={<PanelRightIcon size={24} open={rightOpen} />}
                      label={rightLabel}
                      active={rightOpen}
                      onClick={() => {
                        setLeftOpen(false);
                        setRightOpen((o) => !o);
                      }}
                    />
                  )}
                </nav>
              )}
            </div>
          )}
        </div>
      </div>

      {!isExpanded && hasLeft && (
        <Overlay open={leftOpen} onClose={closeLeftDrawer} side="left" title={leftTitle}>
          {left}
        </Overlay>
      )}
      {!isExpanded && hasRight && (
        <Overlay open={rightOpen} onClose={closeRightDrawer} side="right" title={rightTitle}>
          {right}
        </Overlay>
      )}
    </ShellCoreContext.Provider>
  );
}

/** One bottom-bar button. Exported so a host's extra buttons look the same (one look per act). */
export function BottomButton({
  glyph,
  label,
  onClick,
  disabled,
  active,
}: {
  glyph: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        "flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors disabled:text-[var(--ink-ghost)] " +
        (active
          ? "bg-[var(--sel)] text-[var(--accent)] font-semibold"
          : "text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--sel)]")
      }
    >
      <span aria-hidden className="text-[17px] grid place-items-center">
        {glyph}
      </span>
      <span className="text-[10.5px]">{label}</span>
    </button>
  );
}
