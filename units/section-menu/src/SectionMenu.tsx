/**
 * The section menu: a header button that says where you are (`[icon] Records ▾`) and a large panel
 * that takes you anywhere in the app. The host passes its sections and options as data
 * (`menuList.ts`) and its acts through `api`; this component draws them and owns the behaviour.
 *
 * Behaviour:
 *  • Opens when a pointer that can hover finely rests on the button ~200 ms (a swipe across it opens
 *    nothing), and at once on click or tap everywhere.
 *    It does NOT close when the pointer leaves: it is too big for that.
 *  • Instant: the panel is always mounted, and opening it is a class change. Nothing here fetches.
 *  • Closes with Close, Esc, a click on the dimmed edge, or any choice; focus returns to the
 *    button. Focus moves into the panel on open and Tab stays inside it.
 *  • Close sits in the panel's top row straight below the button (measured on open), so the hand
 *    that opened the menu closes it with one short move down (GilbApp C214-UI1, Kai 2026-10-21).
 *  • The button is the strongest control in the header: closed it is the accent outline and tint,
 *    open (and on hover) it is stronger, so the two states can be told apart (Kai 2026-10-21).
 *  • Left: the sections. Resting on one ~120 ms (hover intent), or focusing it, previews its
 *    options in the next columns, so a diagonal move to an option keeps the preview.
 *    Each opening resets the preview to the section you are in.
 *  • Phone (compact): one column, no hover; the options shown are those of the section you are in.
 *
 * Source: GilbApp `src/components/menu/SectionMenu.tsx` at 0f0f1b7 (2026-10-18), itself ported from
 * the myjackfruit.com menu (MegaMenu.vue + SiteHeader.vue). What was GilbApp's own (its sections, its
 * Stakeholders warning, its ⌘K hint, Sign out, its header offsets) is now passed in.
 *
 * Theme: the editorial-tokens variables (`--surface`, `--ink`, `--accent`, ...), as every unit of this
 * library uses; a host maps its own tokens onto them.
 */
import type React from "react";
import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { MenuIcon, isMenuIconKey, type MenuIconKey } from "./MenuIcon";
import { menuOptionsOf, type MenuOption, type MenuSection } from "./menuList";
import { openColors, parseCssColor, type OpenColors } from "./openColors";

/** How long the pointer must rest on a section before its options are previewed. */
export const HOVER_INTENT_MS = 120;
/**
 * How long the pointer must rest ON THE BUTTON before the menu opens. A pointer that only swipes
 * across the button on its way elsewhere leaves before this runs out, and nothing opens (Kai
 * 2026-11-01). Click, tap and keyboard are not delayed.
 */
export const HOVER_OPEN_DELAY_MS = 200;
/** A click this soon after a hover opened the menu is the same gesture, not a request to close. */
export const HOVER_CLICK_GRACE_MS = 600;

/** The Close below the button is at least this wide, so it is an easy target when the button shows only its icon (a phone). */
export const CLOSE_MIN_WIDTH = 96;
/** The space kept between the "Go to" heading and Close when they share the top row. */
const ROW_GAP = 16;

/** The three window widths (the `size-class` unit's names). */
export type MenuSizeClass = "compact" | "medium" | "expanded";

/** Every word the menu draws. Each has an English default. */
export interface SectionMenuLabels {
  /** The footer's hint on a wide window, given the drawn Esc key. Replaced whole by `footerHint`. */
  hint: (esc: ReactNode) => ReactNode;
  /** The panel's heading and its accessible name. */
  goTo: string;
  /** The button's accessible name. */
  trigger: (currentLabel: string) => string;
  sections: string;
  /** The accessible name of the sections' group. */
  sectionsGroup: string;
  inSection: (label: string) => string;
  /** Under "In <section>" while another section than yours is previewed. */
  previewHint: (label: string) => string;
  alsoUseful: string;
  forYou: string;
  close: string;
  here: string;
  coming: string;
}

export const DEFAULT_LABELS: SectionMenuLabels = {
  hint: (esc) => <>Press {esc} to close</>,
  goTo: "Go to",
  trigger: (label) => `Go to — you are in ${label}`,
  sections: "Your sections",
  sectionsGroup: "Your sections — Tab or the arrow keys move between them",
  inSection: (label) => `In ${label}`,
  previewHint: (label) => `Click an option to go to ${label} and do it`,
  alsoUseful: "Also useful here",
  forYou: "For you",
  close: "Close",
  here: "You are here",
  coming: "Coming",
};

/** What a host may say about one section: a warning line under it, and whether it is busy. */
export interface SectionStatus {
  warning?: string | null;
  busy?: boolean;
}

/** One act at the right of the footer (for example Sign out). */
export interface MenuFooterAction<Api, Icon extends string> {
  label: string;
  icon?: Icon;
  run: (api: Api) => void;
  /** Default `section-menu-footer-action`. */
  testId?: string;
}

/** What a host can do to the menu from outside. */
export interface SectionMenuHandle<Id extends string> {
  /** Opens the menu, previewing `id` (default: the section you are in). */
  openAt: (id?: Id) => void;
  /** Closes it, and focus goes back to the button. */
  close: () => void;
}

export interface SectionMenuProps<Id extends string, Api, Icon extends string = MenuIconKey, Gate = unknown> {
  /** The sections this person sees, in order (the host has applied the gates: `visibleSections`). None: nothing is drawn. */
  sections: readonly MenuSection<Id, Api, Gate, Icon>[];
  /** What the options' gates read (`MenuOption.show`). Without it (or undefined), an option that has a gate is left out. */
  gate?: Gate;
  /** The section the person is in. An id not among `sections` reads as the first section. */
  current: Id;
  /** What the acts run against. While it is undefined a choice only closes the menu. */
  api?: Api;
  /** The window width (take it from the `size-class` unit or the `app-shell` core). */
  sizeClass: MenuSizeClass;
  /** "Also useful here" for a section (for example `(s) => placesFor(s, PLACES)`). */
  places?: (section: MenuSection<Id, Api, Gate, Icon>) => readonly MenuOption<Api, Gate, Icon>[];
  /** "For you", already gated (`forYouFor`). Omitted or empty: no "For you" column. */
  forYou?: readonly MenuOption<Api, Gate, Icon>[];
  /** A warning or a busy state for a section. */
  sectionStatus?: (section: MenuSection<Id, Api, Gate, Icon>) => SectionStatus | undefined;
  /** Called on every choice, after the menu closes and before the act runs, with the section it goes to (if any). */
  onChoose?: (target: Id | undefined) => void;
  /** When true the menu closes at once and does NOT take focus back: another surface (a command palette) took over. */
  dismissed?: boolean;
  /** Footer text on a wide window, in place of `labels.hint`. Default: "Press Esc to close". */
  footerHint?: ReactNode;
  footerAction?: MenuFooterAction<Api, Icon>;
  labels?: Partial<SectionMenuLabels>;
  /** Paint order of the dimmed edge and the panel. Take them from the `overlay-layers` unit (LAYER.menuBackdrop, LAYER.menu). */
  layers: { scrim: number; panel: number };
  /** Where the dimmed edge starts, below the host's header (CSS length). Default `3.5rem`. */
  scrimTop?: string;
  /** Where the panel starts (CSS length). Default `4rem`. */
  panelTop?: string;
  /** Draws an icon. Default: this unit's `MenuIcon` for its own names, nothing for any other. */
  renderIcon?: (icon: Icon, size: number) => ReactNode;
  ref?: Ref<SectionMenuHandle<Id>>;
}

/** True where hover-to-open applies: a pointer that can hover, and finely (not touch). */
function canHoverOpen(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
}

function defaultIcon(icon: string, size: number): ReactNode {
  return isMenuIconKey(icon) ? <MenuIcon name={icon} size={size} /> : null;
}

/**
 * The section menu: the trigger button, the dimmed edge and the always-mounted panel.
 * Put it in the host's header (for example `app-shell`'s `header` slot).
 * With no sections (a gate can hide them all) it draws nothing.
 */
export function SectionMenu<Id extends string, Api, Icon extends string = MenuIconKey, Gate = unknown>(props: SectionMenuProps<Id, Api, Icon, Gate>) {
  if (props.sections.length === 0) return null;
  return <SectionMenuBody {...props} />;
}

function SectionMenuBody<Id extends string, Api, Icon extends string, Gate>(props: SectionMenuProps<Id, Api, Icon, Gate>) {
  const {
    sections, current: currentId, api, sizeClass, places, forYou, sectionStatus, onChoose, dismissed = false,
    footerHint, footerAction, layers, scrimTop = "3.5rem", panelTop = "4rem", ref,
  } = props;
  // The options' gate: passed on to the helpers only when the host gave one (see MenuOption.show).
  // Undefined (a gate still loading) counts as none (Agent.Tester round 2, D8).
  const gateArgs = (props.gate !== undefined ? [props.gate] : []) as [] | [Gate];
  const L: SectionMenuLabels = { ...DEFAULT_LABELS, ...props.labels };
  const icon = (name: Icon, size: number) => (props.renderIcon ?? defaultIcon)(name, size);
  const currentSection = sections.find((s) => s.id === currentId) ?? sections[0]!;
  const current = currentSection.id;
  const compact = sizeClass === "compact";

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Id>(current);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const panelId = useId();
  const closeRowRef = useRef<HTMLDivElement>(null);
  const goToRef = useRef<HTMLSpanElement>(null);
  // Where Close and the "Go to" heading sit in the top row (px from the row's left edge); null until measured.
  const [rowPlace, setRowPlace] = useState<{ close: number; width: number; heading: number } | null>(null);
  // The open button's label token and fill, chosen from the accent as drawn (see openColors.ts); null where the
  // colours cannot be read (no layout engine), which keeps the full accent and `--on-accent`.
  const colorProbeRef = useRef<HTMLSpanElement>(null);
  const [openPaint, setOpenPaint] = useState<OpenColors | null>(null);

  const clearHover = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  // The pending hover-open on the button. Its own timer, so clearing the row preview (clearHover) never
  // cancels it and cancelling it never touches the preview.
  const openTimer = useRef<number | null>(null);
  const clearOpenTimer = () => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    openTimer.current = null;
  };

  // When the pointer's enter opened the menu, the click that usually follows must not close it.
  const hoverOpenedAt = useRef(0);

  const show = useCallback(() => {
    // Each opening starts from where you are.
    setPreview(current);
    setOpen(true);
  }, [current]);

  const close = useCallback(() => {
    clearHover();
    clearOpenTimer();
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useImperativeHandle(ref, () => ({
    openAt: (id?: Id) => {
      setPreview(id ?? current);
      setOpen(true);
    },
    close,
  }), [current, close]);

  // --- While open: Esc closes, Tab stays inside (MegaMenu.vue's trap), focus moves in ---
  useEffect(() => {
    if (!open) return;
    // The Tab order (GilbApp round 3, Rule_Code_accessibility RuleA11yKeyboard): EVERY section is its
    // own Tab stop, and the previewed section's options and places come right after it, so Tab alone
    // reaches every section and everything it previews. Close first, then the sections (each followed,
    // when previewed, by its options and "Also useful here"), then "For you", then the footer act.
    // The panel's DOM order cannot express "options after the previewed section" (they sit in the
    // next column), so the trap computes the order instead of leaving it to the browser.
    // `withComing` also lists the coming (aria-disabled) entries, in their places.
    const focusables = (withComing = false) => {
      const p = panelRef.current;
      if (!p) return [];
      const usable = (root: ParentNode | null) =>
        Array.from(root?.querySelectorAll<HTMLElement>(withComing ? "a[href], button:not([disabled])" : "a[href], button:not([disabled]):not([aria-disabled='true'])") ?? []);
      const closeBtn = p.querySelector<HTMLElement>("[data-testid='section-menu-close']");
      const here = usable(p.querySelector("[data-testid='section-menu-here']"));
      // "Also useful here" belongs to the previewed section too, so it follows that section's options:
      // placed after every section, Tabbing past the later sections previewed each of them and swapped
      // this column, so its links were never reached (GilbApp, Agent.Tester round 3, D11).
      const placeLinks = usable(p.querySelector("[data-testid='section-menu-places']"));
      const shownId = p.querySelector<HTMLElement>("[data-previewing='true']")?.getAttribute("data-section");
      const order: HTMLElement[] = closeBtn ? [closeBtn] : [];
      for (const sec of Array.from(p.querySelectorAll<HTMLElement>("[data-section]"))) {
        order.push(sec);
        if (sec.getAttribute("data-section") === shownId) order.push(...here, ...placeLinks);
      }
      order.push(...usable(p.querySelector("[data-testid='section-menu-foryou']")));
      const act = p.querySelector<HTMLElement>("[data-footer-action]");
      if (act) order.push(act);
      return order;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      // The trap owns every Tab inside the panel: it moves along the order above and wraps.
      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      const i = active ? els.indexOf(active) : -1;
      // A coming entry the arrows landed on is not a Tab stop, so it is not in the list. Step from its place in
      // the same order, coming entries included, to the nearest usable entry in the key's direction, instead of
      // jumping to the first one (Agent.Tester web round 8, D18; the same code was in both units).
      const all = focusables(true);
      const j = active ? all.indexOf(active) : -1;
      if (i === -1 && j !== -1) {
        const dir = e.shiftKey ? -1 : 1;
        for (let k = 1; k <= all.length; k++) {
          const c = all[(((j + dir * k) % all.length) + all.length) % all.length]!;
          if (els.includes(c)) {
            c.focus();
            return;
          }
        }
      }
      if (i === -1) {
        els[0]!.focus();
        return;
      }
      const next = e.shiftKey ? els[(i - 1 + els.length) % els.length]! : els[(i + 1) % els.length]!;
      next.focus();
    };
    document.addEventListener("keydown", onKey);
    // Focus lands on the section you are in, so arrows and Tab start from "You are here".
    const id = requestAnimationFrame(() => {
      const here = panelRef.current?.querySelector<HTMLElement>("[data-current='true']");
      (here ?? focusables()[0])?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(id);
    };
  }, [open, close]);

  useEffect(() => () => { clearHover(); clearOpenTimer(); }, []);

  // Read the accent and the two text tokens as drawn on each opening (a theme may have changed them while closed).
  useLayoutEffect(() => {
    if (!open || !colorProbeRef.current || typeof getComputedStyle !== "function") return;
    const cs = getComputedStyle(colorProbeRef.current);
    const accent = parseCssColor(cs.borderTopColor);
    const ink = parseCssColor(cs.color);
    const onAccent = parseCssColor(cs.backgroundColor);
    setOpenPaint(accent && ink && onAccent ? openColors(accent, ink, onAccent) : null);
  }, [open]);

  // Close goes straight below the button: its left edge under the button's left edge and at least the
  // button's width, kept inside the row. Measured on every opening and on a resize while open (the
  // button's width changes with the section's name). "Go to" stays at the row's start when it fits
  // before Close; otherwise it follows Close.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      const row = closeRowRef.current?.getBoundingClientRect();
      if (!t || !row) return;
      const width = Math.max(t.width, CLOSE_MIN_WIDTH);
      const close = Math.max(0, Math.min(t.left - row.left, row.width - width));
      const headingWidth = goToRef.current?.getBoundingClientRect().width ?? 0;
      const heading = headingWidth + ROW_GAP <= close ? 0 : close + width + ROW_GAP;
      setRowPlace((p) => (p && p.close === close && p.width === width && p.heading === heading ? p : { close, width, heading }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, currentSection.label, sizeClass]);

  // Another surface took over (a command palette opened over the menu): the menu closes and its focus
  // trap stops. It must not pull focus back under that surface, and a choice made there must not leave
  // the menu open over the new section (GilbApp, Agent.Tester D4, D5).
  useEffect(() => {
    if (dismissed && open) {
      clearHover();
      setOpen(false);
    }
  }, [dismissed, open]);

  // The open label, icon and chevron: whichever text token reads on the accent (both class names are written out
  // whole so Tailwind finds them).
  const openText = openPaint?.text === "ink" ? "text-[var(--ink)]" : "text-[var(--on-accent)]";

  const shown = compact ? currentSection : sections.find((s) => s.id === preview) ?? currentSection;
  const previewing = shown.id !== current;

  const choose = (run: (() => void) | undefined, target?: Id) => {
    close();
    onChoose?.(target);
    run?.();
  };

  // A section on the left: rest the pointer (hover intent) or focus it to preview; click to go.
  // Keyboard: Tab and Shift+Tab reach every section and the previewed section's options (the trap's
  // order above). As an extra, Up/Down/Home/End move between sections (focus previews, as the
  // pointer's rest does), Right goes into the previewed options and Left comes back.
  // Found by comparing the attribute, not by a selector, so a host id with a quote in it still works.
  const focusSection = (id: Id) =>
    Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-section]") ?? [])
      .find((el) => el.getAttribute("data-section") === id)
      ?.focus();
  const focusFirstOption = () =>
    panelRef.current?.querySelector<HTMLElement>("[data-testid='section-menu-here'] [data-option]")?.focus();
  const onSectionKey = (e: React.KeyboardEvent, s: MenuSection<Id, Api, Gate, Icon>) => {
    const i = sections.findIndex((x) => x.id === s.id);
    const to =
      e.key === "ArrowDown" ? sections[(i + 1) % sections.length]
      : e.key === "ArrowUp" ? sections[(i - 1 + sections.length) % sections.length]
      : e.key === "Home" ? sections[0]
      : e.key === "End" ? sections[sections.length - 1]
      : null;
    if (to) {
      e.preventDefault();
      setPreview(to.id);
      focusSection(to.id);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusFirstOption();
    }
  };
  const onOptionKey = (e: React.KeyboardEvent) => {
    const list = (e.currentTarget as HTMLElement).parentElement;
    const items = Array.from(list?.querySelectorAll<HTMLElement>("[data-option]") ?? []);
    const i = items.indexOf(e.currentTarget as HTMLElement);
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusSection(shown.id);
    } else if (e.key === "ArrowDown" && i < items.length - 1) {
      e.preventDefault();
      items[i + 1]!.focus();
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      items[i - 1]!.focus();
    }
  };

  const sectionProps = (s: MenuSection<Id, Api, Gate, Icon>) => ({
    onKeyDown: (e: React.KeyboardEvent) => onSectionKey(e, s),
    onMouseEnter: () => {
      if (compact) return;
      clearHover();
      hoverTimer.current = window.setTimeout(() => setPreview(s.id), HOVER_INTENT_MS);
    },
    onFocus: () => {
      if (!compact) setPreview(s.id);
    },
    onClick: () => choose(api !== undefined ? () => s.go(api) : undefined, s.id),
  });

  const shownPlaces = places?.(shown) ?? [];
  const forYouList = forYou ?? [];
  const hasThird = shownPlaces.length > 0 || forYouList.length > 0;
  const runOf = (o: MenuOption<Api, Gate, Icon>) => (api !== undefined && o.run ? () => o.run!(api) : undefined);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={L.trigger(currentSection.label)}
        data-testid="section-menu-trigger"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse" && canHoverOpen() && !open) {
            // Open only if the pointer is still here after the delay: a swipe across the button on the
            // way elsewhere leaves first (onPointerLeave) and opens nothing.
            clearOpenTimer();
            openTimer.current = window.setTimeout(() => {
              openTimer.current = null;
              hoverOpenedAt.current = Date.now();
              show();
            }, HOVER_OPEN_DELAY_MS);
          }
        }}
        onPointerLeave={clearOpenTimer}
        onClick={() => {
          // A click is not delayed: it takes over from a pending hover-open and opens (or closes) now.
          clearOpenTimer();
          // The click that follows a hover-open keeps it open; a later click closes it.
          if (open && Date.now() - hoverOpenedAt.current < HOVER_CLICK_GRACE_MS) return;
          if (open) close();
          else show();
        }}
        data-state={open ? "open" : "closed"}
        data-open-text={open ? (openPaint?.text ?? "on-accent") : undefined}
        style={open && openPaint && openPaint.mix > 0 ? { backgroundColor: openFill(openPaint) } : undefined}
        className={
          // The header's main control: larger than its neighbours, an accent outline (2 px) and tint when closed,
          // the full accent when open. A 3 px accent ring outside a gap shows keyboard focus in both states.
          // Below `sm` the name is hidden and the padding is tighter, so the phone button is 64 px wide, as in 0.1.0
          // (Agent.Tester s131 D2: 76 px pushed a 390 px header 10 px past the screen).
          "flex-none flex items-center gap-1.5 sm:gap-2.5 h-12 min-h-[44px] pl-2 sm:pl-3 pr-1.5 sm:pr-2.5 rounded-[var(--r-md)] border-2 border-[var(--accent)] " +
          "font-semibold text-[16px] tracking-[-0.01em] cursor-pointer " +
          "transition-[background-color,color,box-shadow] motion-reduce:transition-none " +
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] " +
          (open
            ? "bg-[var(--accent)] " + openText + " shadow-[0_2px_10px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--ink)] " +
              "hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] hover:shadow-[0_2px_10px_color-mix(in_srgb,var(--accent)_30%,transparent)] " +
              "focus-visible:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)]")
        }
      >
        {/* Not drawn: carries the accent and the two text tokens, so their drawn values can be read (openColors). */}
        <span
          ref={colorProbeRef}
          aria-hidden
          hidden
          style={{ color: "var(--ink)", backgroundColor: "var(--on-accent)", borderTopColor: "var(--accent)" }}
        />
        <span data-testid="section-menu-trigger-icon" className={(open ? openText : "text-[var(--accent)]") + " grid place-items-center"}>
          {icon(currentSection.icon, 22)}
        </span>
        <span className="hidden sm:inline" data-testid="section-menu-trigger-label">
          {currentSection.label}
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          data-testid="section-menu-trigger-chevron"
          className={
            "transition-transform motion-reduce:transition-none " +
            (open ? "rotate-180 " + openText : "text-[var(--accent-ink)]")
          }
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* The dimmed edge. Below the header, so the header stays readable; a click goes back. */}
      <div
        aria-hidden
        data-testid="section-menu-scrim"
        onClick={close}
        style={{ top: scrimTop, zIndex: layers.scrim }}
        className={
          "fixed inset-x-0 bottom-0 bg-[color-mix(in_srgb,var(--ink)_38%,transparent)] " +
          (open ? "opacity-100" : "opacity-0 pointer-events-none")
        }
      />

      {/* Always mounted, so opening is a class change and nothing more. `inert` while closed keeps
          it out of the tab order and the accessibility tree. */}
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label={L.goTo}
        aria-hidden={!open}
        inert={!open}
        data-testid="section-menu-panel"
        data-open={open ? "true" : "false"}
        style={{ top: panelTop, zIndex: layers.panel }}
        className={
          "fixed flex flex-col bg-[var(--surface)] shadow-[var(--shadow-lg)] " +
          (compact ? "left-[10px] right-[10px] bottom-[10px] rounded-[18px] " : "left-6 right-6 bottom-6 rounded-[20px] ") +
          "transition-[opacity,transform] duration-[90ms] motion-reduce:transition-none " +
          (open ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1.5 pointer-events-none")
        }
      >
        {/* The top row: Close straight below the button, "Go to" before it when it fits (else after it).
            One Close only: the far-right one it replaces would compete with it. */}
        <div className={compact ? "px-3.5 pt-3 pb-1" : "px-6 pt-4 pb-1.5"}>
          <div ref={closeRowRef} className="relative h-12" data-testid="section-menu-top-row">
            <span
              ref={goToRef}
              style={{ left: rowPlace?.heading ?? 0 }}
              className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[13px] tracking-[0.14em] uppercase font-semibold text-[var(--ink-faint)]"
            >
              {L.goTo}
            </span>
            <button
              type="button"
              onClick={close}
              data-testid="section-menu-close"
              style={{ left: rowPlace?.close ?? 0, width: rowPlace?.width ?? CLOSE_MIN_WIDTH }}
              className={
                "absolute top-1/2 -translate-y-1/2 flex items-center justify-center gap-2 h-12 min-h-[44px] px-4 " +
                "rounded-[var(--r-md)] border-2 border-[var(--accent)] bg-[var(--surface)] text-[var(--ink)] font-semibold text-[15px] cursor-pointer " +
                "hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] " +
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
              }
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden className="text-[var(--accent-ink)]">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
              {L.close}
            </button>
          </div>
        </div>

        <div
          className={
            "flex-1 min-h-0 overflow-auto grid " +
            (compact
              ? "grid-cols-1 gap-1 px-3.5 pb-3"
              : sizeClass === "medium"
                ? "grid-cols-2 gap-8 px-8 pb-4"
                : hasThird
                  ? "grid-cols-[minmax(300px,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] gap-9 px-8 pb-4"
                  : "grid-cols-[minmax(300px,1.15fr)_minmax(0,2fr)] gap-9 px-8 pb-4")
          }
        >
          <div
            className={
              compact ? "" : "border-r border-[var(--line)] pr-7 " + (sizeClass === "medium" ? "row-span-2" : "")
            }
            onMouseLeave={clearHover}
          >
            <ColumnHeading>{L.sections}</ColumnHeading>
            {/* Every section is a Tab stop; the arrows are an extra, named for screen readers. */}
            <div className="grid grid-cols-1 gap-0.5" data-testid="section-menu-sections" role="group" aria-label={L.sectionsGroup}>
              {sections.map((s) => {
                const isCurrent = s.id === current;
                const isPreview = !compact && s.id === shown.id && previewing;
                const status = sectionStatus?.(s);
                const warn = status?.warning ?? null;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-section={s.id}
                    data-current={isCurrent ? "true" : undefined}
                    data-previewing={s.id === shown.id ? "true" : undefined}
                    aria-current={isCurrent ? "page" : undefined}
                    aria-busy={status?.busy ? true : undefined}
                    title={warn ?? undefined}
                    {...sectionProps(s)}
                    className={itemClass(isCurrent ? "current" : isPreview ? "preview" : "plain") + " items-center px-3 py-2.5"}
                  >
                    <Icon current={isCurrent} big>{icon(s.icon, 20)}</Icon>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className={(compact ? "text-[18px]" : "text-[24px]") + " font-bold tracking-[-0.02em] leading-[1.1]"}>
                          {s.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--accent-ink)]" data-testid="section-menu-here-tag">
                            {L.here}
                          </span>
                        )}
                      </span>
                      <span className="block text-[14px] text-[var(--ink-soft)] mt-0.5">{s.description}</span>
                      {s.note && <span className="block text-[11px] italic text-[var(--ink-faint)]">{s.note}</span>}
                      {warn && (
                        <span className="block text-[12px] text-[var(--bad)]" data-testid={`section-menu-${s.id}-warning`}>
                          {warn}
                        </span>
                      )}
                    </span>
                    {isPreview && (
                      <span aria-hidden className="ml-auto self-center text-[22px] text-[var(--ink-faint)]">
                        ›
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div data-testid="section-menu-here">
            <ColumnHeading>
              {L.inSection(shown.label)}
              {previewing && (
                <span className="block text-[12px] font-medium tracking-normal normal-case text-[var(--accent-ink)] mt-1">
                  {L.previewHint(shown.label)}
                </span>
              )}
            </ColumnHeading>
            <OptionList
              options={menuOptionsOf(shown, ...gateArgs)}
              onChoose={(o) => choose(runOf(o), shown.id)}
              onKeyDown={onOptionKey}
              icon={icon}
              comingLabel={L.coming}
            />
          </div>

          {hasThird && (
            <div>
              {shownPlaces.length > 0 && (
                <>
                  <ColumnHeading>{L.alsoUseful}</ColumnHeading>
                  <OptionList options={shownPlaces} onChoose={(o) => choose(runOf(o))} testId="section-menu-places" onKeyDown={onOptionKey} icon={icon} comingLabel={L.coming} />
                </>
              )}
              {forYouList.length > 0 && (
                <>
                  <ColumnHeading>{L.forYou}</ColumnHeading>
                  <OptionList options={forYouList} onChoose={(o) => choose(runOf(o))} testId="section-menu-foryou" onKeyDown={onOptionKey} icon={icon} comingLabel={L.coming} />
                </>
              )}
            </div>
          )}
        </div>

        <div
          className={
            "flex items-center gap-3 border-t border-[var(--line)] text-[14px] text-[var(--ink-soft)] " +
            (compact ? "px-3.5 py-2" : "px-6 py-3.5")
          }
        >
          {!compact && <span>{footerHint ?? L.hint(<Kbd>Esc</Kbd>)}</span>}
          {footerAction && (
            <button
              type="button"
              onClick={() => choose(api !== undefined ? () => footerAction.run(api) : undefined)}
              data-testid={footerAction.testId ?? "section-menu-footer-action"}
              data-footer-action=""
              className="ml-auto flex items-center gap-1.5 min-h-[44px] px-2 text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              {footerAction.icon !== undefined && icon(footerAction.icon, 16)}
              {footerAction.label}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** The open fill when the accent is mixed toward a text token (tokens only, no colour values). */
function openFill(p: OpenColors): string {
  const toward = p.mixToward === "ink" ? "var(--ink)" : "var(--on-accent)";
  return `color-mix(in srgb, var(--accent) ${100 - p.mix}%, ${toward} ${p.mix}%)`;
}

/** A column of options. A coming entry is greyed and does nothing; an address opens a new tab. */
function OptionList<Api, Icon extends string, Gate>({
  options,
  onChoose,
  testId,
  onKeyDown,
  icon,
  comingLabel,
}: {
  options: readonly MenuOption<Api, Gate, Icon>[];
  /** Called for an address too; its act is the link's own. */
  onChoose: (option: MenuOption<Api, Gate, Icon>) => void;
  testId?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  icon: (name: Icon, size: number) => ReactNode;
  comingLabel: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      {options.map((o) => {
        const body = (
          <>
            <Icon>{icon(o.icon, 20)}</Icon>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 flex-wrap text-[15px] font-semibold">
                {o.label}
                {o.href && !o.coming && <span aria-hidden className="text-[var(--ink-faint)]">↗</span>}
                {o.coming && (
                  <span className="text-[11px] font-semibold rounded-full px-[7px] py-px bg-[var(--paper-2)] text-[var(--ink-faint)]">
                    {comingLabel}
                  </span>
                )}
              </span>
              <span className="block text-[14px] text-[var(--ink-soft)] mt-0.5">{o.description}</span>
              {o.context && <span className="block text-[11px] italic text-[var(--ink-faint)]">{o.context}</span>}
            </span>
          </>
        );
        // A coming entry is never a live link, even when it has an address (Agent.Tester D4).
        if (o.href && !o.coming) {
          // The link opens the address itself; the choice only closes the menu, so no act is passed on.
          return (
            <a
              key={o.id}
              href={o.href}
              target="_blank"
              rel="noopener noreferrer"
              data-option={o.id}
              onKeyDown={onKeyDown}
              onClick={() => onChoose({ ...o, run: undefined })}
              className={itemClass("plain") + " px-3 py-2.5"}
            >
              {body}
            </a>
          );
        }
        return (
          <button
            key={o.id}
            type="button"
            data-option={o.id}
            onKeyDown={onKeyDown}
            aria-disabled={o.coming ? true : undefined}
            onClick={() => {
              if (o.coming) return;
              onChoose(o);
            }}
            className={itemClass(o.coming ? "coming" : "plain") + " px-3 py-2.5"}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function itemClass(kind: "plain" | "current" | "preview" | "coming"): string {
  const base =
    "w-full flex gap-3.5 items-start min-h-[44px] rounded-[14px] border text-left text-[var(--ink)] outline-none " +
    "focus-visible:ring-2 focus-visible:ring-[var(--focus)] ";
  switch (kind) {
    case "current":
      return base + "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border-[var(--accent)]";
    case "preview":
      return base + "bg-[var(--paper)] border-[var(--ink-ghost)]";
    case "coming":
      return base + "border-transparent opacity-55 cursor-default";
    default:
      return base + "border-transparent hover:bg-[var(--paper)] hover:border-[var(--line)] focus-visible:bg-[var(--paper)]";
  }
}

function Icon({ children, current, big }: { children: ReactNode; current?: boolean; big?: boolean }) {
  return (
    <span
      className={
        "flex-none grid place-items-center " +
        (big ? "w-11 h-11 rounded-[12px] " : "w-[34px] h-[34px] rounded-[10px] ") +
        (current
          ? "bg-[var(--accent)] text-[var(--on-accent)]"
          : "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-ink)]")
      }
    >
      {children}
    </span>
  );
}

function ColumnHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-3.5 mb-2.5 text-[12px] tracking-[0.16em] uppercase font-semibold text-[var(--ink-faint)]">
      {children}
    </h3>
  );
}

/**
 * A key name as drawn in the menu's footer hint, for a host's own `footerHint`.
 * @param children the key, for example `Esc` or `⌘K`
 */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-[var(--mono)] text-[12px] border border-[var(--line)] rounded-md px-1.5 py-px bg-[var(--paper)]">
      {children}
    </kbd>
  );
}
