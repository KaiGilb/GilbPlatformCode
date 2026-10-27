/**
 * ONE framed group of a record card.
 *
 * A group is a frame with a title (and a small icon) that holds ITS items, separated by hairlines, and a gap between frames.
 * Every repeating set is one group; the title names what the frame holds, so no title floats over another group's content.
 *
 * In PRESENTATION a group with nothing in it is not drawn at all (`empty`): no placeholder, no "add ...", no dash.
 * The frame uses the theme's own tokens: the lifted `--surface` and a hairline from `--lines`; both themes.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { CardIcon, type CardIconName } from "./cardIcons";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";

/** The chooser's heading a group is listed under (Name, Connection points, Companies, Skills and interests, ...). */
export function chooserSectionOf(kind: string): string {
  if (kind === "name") return "Name";
  if (["email", "phone", "address", "social"].includes(kind)) return "Connection points";
  if (kind === "employment") return "Companies";
  if (["skill", "interest", "language"].includes(kind)) return "Skills and interests";
  if (kind.startsWith("relation-")) return "Relations";
  if (kind.startsWith("channel-") || kind === "time-zone") return "Contact preferences";
  if (kind === "attachments") return "Attachments";
  // "My Note" and "Where / How we met": the holder-only notes at the top of the card.
  if (kind === "my-note" || kind === "how-we-met") return "Notes";
  // Plan card: each template line is a group whose kind starts with `plan-`.
  if (kind.startsWith("plan-")) return "Plan";
  return "Record";
}


/**
 * After the person picks an information type from the chooser, the cursor goes to the right field so they can just start typing.
 * The person has just picked this group from the chooser. A group that adds its first value
 * through a control of its own (a new empty row, a picker, a form) names that control `data-card-add`; the pick PRESSES it for the person, and
 * the group's own code does what it does for the person's own press: the new row's box takes the focus, or the picker's search box, or the
 * form's first field. A group with no such control gets its first control focused (a list of fields, a record finder, an Attach button).
 *
 * ⚠ ONLY after the pick: this runs from the group's `focusKind` effect, which only the chooser sets. ⛔ Nothing is focused on loading.
 * ⚠ A control that is not ready yet (the group's own data is still being read: on a slow connection that can take 15 to 22 s; a list still
 * loading; a button disabled meanwhile) is waited for as long as the pick is pending, at most 60 s. The wait ends at once when the person does
 * anything of their own: presses a key, presses anywhere, or puts the cursor anywhere else, so a late list never takes
 * the focus back. While waiting nothing is drawn or moved: the group shows what it already shows. Returns the cleanup.
 */
export const CARD_ADD_ATTR = "data-card-add";
const FIRST_CONTROL = "input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)";
export const FOCUS_WAIT_MS = 60000;

function focusAfterPick(el: HTMLElement, done: () => void): () => void {
  let finished = false;
  let observer: MutationObserver | null = null;
  let timer: number | null = null;
  let stopListening: (() => void) | null = null;
  /** Stop watching (the group went away or changed under us). The pick stays pending: a group that comes back (a section heading toggling remounts it)
   *  starts the wait again, so the pick is not lost; leaving edit mode clears it (`CardModeProvider.leave`). */
  const stop = () => {
    observer?.disconnect();
    stopListening?.();
    if (timer !== null) window.clearTimeout(timer);
  };
  /** The pick is over: done, or given up, or the person acted. */
  const finish = () => {
    if (finished) return;
    finished = true;
    stop();
    done();
  };
  /** True when this attempt did its work. */
  const attempt = (): boolean => {
    const add = el.querySelector<HTMLElement>(`[${CARD_ADD_ATTR}]:not(:disabled)`);
    if (add) {
      add.click();
      return true;
    }
    // An add control that is only disabled for now (loading) is waited for, ⛔ not replaced by focusing something else.
    if (el.querySelector(`[${CARD_ADD_ATTR}]`)) return false;
    const first = el.querySelector<HTMLElement>(FIRST_CONTROL);
    if (!first) return false;
    first.focus();
    return true;
  };
  if (attempt()) {
    finish();
    return () => {};
  }
  // Not ready: look again when the group changes, until the person acts on their own or the wait is over.
  observer = new MutationObserver(() => {
    const a = document.activeElement;
    // The chooser's own sheet is gone by now; focus on the page body means the person has not gone elsewhere.
    if (a && a !== document.body && !el.contains(a)) return finish();
    if (attempt()) finish();
  });
  observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
  // The person's own act ends the wait: a key or a press. (The cursor put somewhere outside the group is seen by the observer above, which looks
  // before every attempt; so a control that turns up later never takes the focus back.)
  const mine = () => finish();
  const acts = ["keydown", "pointerdown"] as const;
  for (const t of acts) document.addEventListener(t, mine, true);
  stopListening = () => {
    for (const t of acts) document.removeEventListener(t, mine, true);
  };
  timer = window.setTimeout(finish, FOCUS_WAIT_MS);
  return stop;
}

/** The frame's line: `--lines` at 14%, a step stronger than the `--line` hairline (9% of the ink), so the frame also reads on a dark
 *  theme's paper. */
const FRAME_LINE = "color-mix(in srgb, var(--lines) 14%, transparent)";

export function CardGroup({
  kind,
  title,
  icon,
  helper,
  aside,
  empty = false,
  keepInEdit = false,
  addable = true,
  label,
  children,
  className = "",
  testId,
  dataAttrs,
  addOwn,
  inline = false,
}: {
  /** A stable name for the group (tests, mutation checks): "email", "phone", "relation-actsOnBehalfOf" … */
  kind: string;
  title: ReactNode;
  icon?: CardIconName;
  /** One quiet line under the title that says what the group means (shown whenever the group is). */
  helper?: ReactNode;
  /** Something that sits at the right of the title (the slot for the kind-of-contact chips beside the name). */
  aside?: ReactNode;
  /** Nothing to show: the group is not drawn (a card does not have to show all its fields all the time).
   *  In edit mode it comes back when the person adds it from the chooser, and it stays once it has had a value in this edit. */
  empty?: boolean;
  /** Shown whenever the card is being edited, empty or not (the name boxes: a new record has nothing else to type into). */
  keepInEdit?: boolean;
  /** False for a group the card may only show (it cannot add to it): the chooser does not offer it. */
  addable?: boolean;
  /** The chooser's words for the group, when the title is not plain text. */
  label?: string;
  children: ReactNode;
  className?: string;
  /** The section's own test id where an earlier test already addresses it (`email-rows`); default "card-group". */
  testId?: string;
  /** Extra data attributes of the section (a test or a tool addresses the group by them). */
  dataAttrs?: Record<string, string>;
  /** The group's "+ Add your own" (and its open form), drawn last in the group. */
  addOwn?: ReactNode;
  /** One line: the icon, the title, the group's content and the aside side by side (an empty note is much smaller this way).
   *  It wraps under the title on a narrow card. */
  inline?: boolean;
}) {
  const mode = useCardMode();
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const groupEmpty = empty;
  // A group that has had a value during this edit stays (removing its last value must not make the whole frame vanish under the finger).
  const seen = useRef(false);
  if (mode.presentation) seen.current = false;
  else if (!groupEmpty) seen.current = true;
  const opened = mode.opened.has(kind);
  const hidden = mode.managed && !mode.showAll && groupEmpty && !(mode.editing && (opened || seen.current || keepInEdit));
  const chooserLabel = label ?? (typeof title === "string" ? title : kind);
  const { register, focusKind, clearFocus } = mode;
  useEffect(() => {
    if (!mode.managed) return;
    return register({ kind, label: chooserLabel, section: chooserSectionOf(kind), shown: !hidden, addable });
  }, [mode.managed, register, kind, chooserLabel, hidden, addable]);
  // The chooser just opened this group: bring it into view and put the cursor where the person starts typing (see `focusAfterPick`).
  useEffect(() => {
    if (focusKind !== kind || hidden) return;
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView?.({ block: "center" });
    return focusAfterPick(el, clearFocus);
  }, [focusKind, kind, hidden, clearFocus]);
  if (hidden) return null;
  if (inline) {
    return (
      <section
        ref={ref}
        aria-labelledby={id}
        data-testid={testId ?? "card-group"}
        data-group={kind}
        data-inline="true"
        {...dataAttrs}
        // A container: on a narrow card (under 28rem: a phone) the box takes its own full-width line under the title and the aside;
        // on a wider card all four sit on one line.
        className={`@container rounded-xl border bg-[var(--surface)] px-4 py-1.5 ${className}`}
        style={{ borderColor: FRAME_LINE }}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {icon ? <CardIcon name={icon} className="shrink-0 text-[14px] text-[var(--accent-ink)]" /> : null}
          <h3 id={id} className="shrink-0 font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">
            {title}
          </h3>
          <div className="order-last min-w-0 basis-full @md:order-none @md:basis-0 @md:flex-1" data-testid="card-group-items">
            {children}
          </div>
          {aside ? <div className="ml-auto shrink-0 @md:ml-0" data-testid="card-group-aside">{aside}</div> : null}
        </div>
      </section>
    );
  }
  return (
    <section
      ref={ref}
      aria-labelledby={id}
      data-testid={testId ?? "card-group"}
      data-group={kind}
      {...dataAttrs}
      // The frame: `rounded-xl border`, `px-4 py-3`, the group's name as a small italic label at the top.
      className={`rounded-xl border bg-[var(--surface)] px-4 py-3 ${className}`}
      style={{ borderColor: FRAME_LINE }}
    >
      <header className="flex items-center gap-2">
        {icon ? <CardIcon name={icon} className="shrink-0 text-[14px] text-[var(--accent-ink)]" /> : null}
        <h3 id={id} className="min-w-0 flex-1 font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">
          {title}
        </h3>
        {/* The aside may SHRINK and wrap inside the card (a row of four chips plus "+ Kind" ran to the card's edge in dark edit mode with a side panel open) */}
        {aside ? <div className="min-w-0 max-w-[75%]" data-testid="card-group-aside">{aside}</div> : null}
      </header>
      {helper ? <p className="pt-0.5 text-[12px] text-[var(--ink-faint)]" data-testid="card-group-helper">{helper}</p> : null}
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-[var(--line)]" data-testid="card-group-items">
        {children}
        {addOwn ?? null}
      </div>
    </section>
  );
}

/** A heading for a set of frames that belong together ("Relations", "Contact preferences", "Record"). */
export function CardSection({
  title,
  children,
  testId,
  empty = false,
  kinds = [],
}: {
  title: ReactNode;
  children: ReactNode;
  testId?: string;
  /** Nothing in any of its groups: the heading is not drawn either. */
  empty?: boolean;
  /** The groups under it: the heading stays in edit mode while one of them is open or has had a value in this edit. */
  kinds?: readonly string[];
}) {
  const id = useId();
  const mode = useCardMode();
  const seen = useRef(false);
  if (mode.presentation) seen.current = false;
  else if (!empty) seen.current = true;
  // Hidden heading: the groups under it are still mounted (each is hidden by its own `empty`), so the chooser knows them.
  if (mode.managed && !mode.showAll && empty && !(mode.editing && (seen.current || kinds.some((k) => mode.opened.has(k))))) return <>{children}</>;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-testid={testId ?? "card-section"}>
      <h2 id={id} className="px-1 font-[var(--serif)] text-[15px] font-semibold text-[var(--ink)]">
        {title}
      </h2>
      {children}
    </section>
  );
}
