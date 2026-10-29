/**
 * The pickers a field row can edit through, supplied by the host. All members are optional: with none supplied the row has only its text,
 * choice and textarea branches (the birthday picker is a peer unit and is always there).
 *
 * A host that wants the contact-language and time-zone rows to be picked from a list wraps the card in `FieldPickersProvider`.
 * Without a provider the answer is the empty set, so a row asked for `picker="contact-language"` or `"time-zone"` falls back to the
 * text box. (This differs from the other host contexts of the library, which throw without a provider: these members are optional.)
 *
 * Module state: `FieldPickersContext` is one React context. Two installed copies of this unit would not see each other's provider.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from "react";

/** What every picker is given and gives back: the row's label and stored value; a pick, a cancel and (to empty the row) a clear. */
export interface FieldPickerProps {
  label: string;
  value: string;
  onPick(value: string): void;
  onCancel(): void;
  onClear(): void;
}

/** The host's members. Each is optional. */
export interface FieldPickers {
  /** Replaces the app's `ContactLanguagePicker` (components/mynet/ContactLanguagePicker, FieldRow.tsx:37), used for `picker="contact-language"`. */
  ContactLanguagePicker?: ComponentType<FieldPickerProps>;
  /** Replaces the app's `TimeZonePicker` (components/mynet/TimeZonePicker, FieldRow.tsx:38), used for `picker="time-zone"`. */
  TimeZonePicker?: ComponentType<FieldPickerProps>;
  /** Replaces the app's `contactLanguageDisplay` (lib/mynet/languages/contactLanguageTag, FieldRow.tsx:39): how a stored language reads. Absent: as stored. */
  contactLanguageDisplay?: (value: string) => string;
  /** Replaces the app's `timeZoneDisplay` (lib/mynet/time/timeZones, FieldRow.tsx:40): how a stored time zone reads. Absent: as stored. */
  timeZoneDisplay?: (value: string) => string;
}

const NO_PICKERS: FieldPickers = {};
const FieldPickersContext = createContext<FieldPickers>(NO_PICKERS);

export function FieldPickersProvider({ pickers, children }: { pickers: FieldPickers; children: ReactNode }) {
  return <FieldPickersContext.Provider value={pickers}>{children}</FieldPickersContext.Provider>;
}

/** The host's pickers, or none (an empty object) when no provider is above. */
export function useFieldPickers(): FieldPickers {
  return useContext(FieldPickersContext);
}
