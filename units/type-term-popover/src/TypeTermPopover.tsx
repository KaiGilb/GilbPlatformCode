// A type name as a link-styled button. A click opens a small popover with the type's definition and ONE
// outbound link, "Open in GilbVeda ↗" (new tab).
//
// The definition is read through `typeDefinitionOnce` (termDefinition.ts): a once-per-session read over the
// host's reader. The link shows only when the term was READ (defined or none); an unreachable read says
// nothing about the term, so it gets no link.
//
// The popover is portalled to the open create dialog's root (or the body) so a scrolling list
// cannot clip it, and sits on the modal layer by inline style (never a `z-[N]` class).
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MODAL_LAYER_Z, registerOpen, useModalPortalTarget } from "@kaigilb/gilbplatformcode-open-popups";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { TermDefinition } from "./types";
import { TermDefinitionContext, typeDefinitionOnce } from "./termDefinition";

/** Marks the popover so the create dialog's Escape leaves the key to it. */
export const TYPE_POPOVER_ATTR = "data-type-term-popover";

export function TypeTermPopover({
  typeName,
  label,
  children,
  className,
  triggerTestId,
  popoverTestId = "type-term-popover",
  ariaLabel,
  onOpenOntology,
}: {
  /** Bare term name, with or without `t:`. */
  typeName: string;
  label?: string;
  children: ReactNode;
  className?: string;
  triggerTestId?: string;
  popoverTestId?: string;
  ariaLabel?: string;
  /** Optional second action (the in-app Ontology section). */
  onOpenOntology?: (name: string) => void;
}) {
  const bare = typeName.replace(/^t:/, "").trim();
  const [open, setOpen] = useState(false);
  const [def, setDef] = useState<TermDefinition | null>(null);
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const read = useContext(TermDefinitionContext);
  if (!read) throw new Error("type-term-popover: wrap the app in <TermDefinitionContext.Provider value={readTermDefinition}>");
  const target = useModalPortalTarget();

  useEffect(() => {
    if (!open || def || !bare) return;
    let live = true;
    void typeDefinitionOnce(read, bare).then((d) => live && setDef(d));
    return () => {
      live = false;
    };
  }, [open, def, bare, read]);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  // While open the popover is on the open-popover stack (the layers leave Escape and Tab to it; opening another closes this one),
  // an outside press or a scroll closes it (focus stays where the person put it).
  const quiet = useRef(() => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const off = registerOpen({ el: () => box.current, close: () => close(), dismiss: () => quiet.current(), exclusive: true });
    const press = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && (box.current?.contains(t) || trigger.current?.contains(t))) return;
      quiet.current();
    };
    const scroll = (e: Event) => {
      if (e.target instanceof Node && box.current?.contains(e.target)) return;
      quiet.current();
    };
    document.addEventListener("pointerdown", press, true);
    window.addEventListener("scroll", scroll, true);
    return () => {
      off();
      document.removeEventListener("pointerdown", press, true);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-testid={triggerTestId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ left: r.left, top: r.bottom + 4 });
          setOpen(!open);
        }}
      >
        {children}
      </button>
      {open
        ? createPortal(
            <span
              ref={box}
              tabIndex={-1}
              role="dialog"
              aria-label={`${label || bare} definition`}
              data-testid={popoverTestId}
              {...{ [TYPE_POPOVER_ATTR]: "" }}
              style={{ position: "fixed", left: at.left, top: at.top, zIndex: MODAL_LAYER_Z }}
              className="flex w-64 flex-col gap-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-2 text-[13px] text-[var(--ink)] shadow"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  close();
                }
              }}
            >
              <span>
                {!def
                  ? "Reading the definition…"
                  : def.state === "defined"
                    ? def.does
                    : def.state === "none"
                      ? "This type has no definition."
                      : "The definition could not be reached."}
              </span>
              {def && def.state !== "unreachable" ? (
                <a
                  href={`${termOrigin()}/base/t/${encodeURIComponent(bare)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start text-[var(--accent)] underline decoration-dotted"
                >
                  Open in GilbVeda ↗
                </a>
              ) : null}
              {onOpenOntology ? (
                <button
                  type="button"
                  className="self-start text-[var(--accent)] underline decoration-dotted"
                  onClick={() => onOpenOntology(bare)}
                >
                  Open in Ontology
                </button>
              ) : null}
            </span>,
            target,
          )
        : null}
    </>
  );
}
