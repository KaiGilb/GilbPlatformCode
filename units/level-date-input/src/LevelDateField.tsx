import { YEAR_RANGE_SENTENCE, yearOutOfRange } from "@kaigilb/gilbplatformcode-date-rules";

/** The test id of the year alert. */
export const LEVEL_DATE_ERROR_TESTID = "plan-date-year-error";

export interface LevelDateFieldProps {
  /** The level's stored date ("" = none). Uncontrolled: give the component a React `key` that changes with the level and its date, for example `key={`${id}|${when}`}`. */
  defaultValue: string;
  /** Whether to show the year alert. A host shows it when the card is in edit mode and the alert belongs to this open level. */
  showYearError: boolean;
  /** Called on every change with yearOutOfRange(value) (a host sets its alert state from this). */
  onYearCheck: (outOfRange: boolean) => void;
  /** Called on Enter and on blur with the input's value. The host decides whether to write (see date-rules levelDateWritable). */
  onCommit: (value: string) => void;
  /** Called on Escape, after the event's propagation is stopped. A host closes the level popover here. */
  onEscape: () => void;
}

/**
 * The level's own date. Written on Enter or when the field is left, never per keystroke.
 * Returns the labelled date input, then the year alert when `showYearError` is true.
 */
export function LevelDateField({ defaultValue, showYearError, onYearCheck, onCommit, onEscape }: LevelDateFieldProps) {
  return (
    <>
      <label className="mt-1 flex items-center gap-1">
        <span>Date</span>
        <input
          type="date"
          aria-label="Date"
          defaultValue={defaultValue}
          className="rounded border border-gray-300 px-1"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onEscape();
            } else if (e.key === "Enter") onCommit(e.currentTarget.value);
          }}
          onChange={(e) => onYearCheck(yearOutOfRange(e.currentTarget.value))}
          onBlur={(e) => onCommit(e.currentTarget.value)}
        />
      </label>
      {showYearError ? (
        <p role="alert" data-testid="plan-date-year-error" className="mt-1 text-[var(--danger,#b91c1c)]">
          {YEAR_RANGE_SENTENCE}
        </p>
      ) : null}
    </>
  );
}
