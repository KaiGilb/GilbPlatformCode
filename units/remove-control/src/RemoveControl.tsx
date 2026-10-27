// The one delete control of a record card: a red round (minus), drawn at the LEFT of the row it
// deletes, as the first child of that row, in front of the content. Do not draw a text "x" or a text
// minus for a delete; use this component.
//
// The glyph is an inline SVG (a filled circle with the minus cut out of it), coloured with
// `--color-error-dark`, falling back to `--bad`, then to #b3261e. The button is a `size-6` box with a
// `text-lg` glyph.
//
// `label` is REQUIRED and is the accessible name. The glyph is `aria-hidden`, so without it the control
// would be an unnamed button; making it required is why that cannot happen at any call site.
//
// No confirm and no undo: it deletes at once. What stops a mis-tap is where the control is, not a
// prompt: it sits next to the content it deletes, never at the far edge of the row where a thumb or a
// scrollbar lands.

export function RemoveControl({
  label,
  onClick,
  disabled = false,
  className = "",
  testId,
}: {
  /** Accessible name — must name the THING being removed, e.g. "Remove address home". */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Layout-only nudge from the call site (e.g. `mt-1` to align with a taller row). */
  className?: string;
  /** The test id for this control. */
  testId?: string;
}) {
  return (
    <button
      type="button"
      // Joined rather than interpolated: an empty nudge must not leave a trailing space.
      // The circle is 24 px, but its hit area is 40 px (the `before:` box reaches 8 px past every side), so
      // a finger or a pointer lands on it; and it shows a visible focus ring for the keyboard.
      className={["relative flex size-6 shrink-0 items-center justify-center rounded text-lg before:absolute before:-inset-2 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-50", className]
        .filter(Boolean)
        .join(" ")}
      style={{ color: "var(--color-error-dark, var(--bad, #b3261e))" }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      data-remove-control="minus-circle"
    >
      <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" fill="currentColor">
        <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM6 10.8h12v2.4H6Z" />
      </svg>
    </button>
  );
}
