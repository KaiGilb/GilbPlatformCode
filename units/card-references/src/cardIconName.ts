// The names of the card's icons: a structural copy of the type `CardIconName` of `card-group` (which also holds the drawings),
// so this unit does not install a component for a type. The two unions are the same list.
export type CardIconName =
  | "name"
  | "email"
  | "phone"
  | "address"
  | "account"
  | "skill"
  | "interest"
  | "language"
  | "employment"
  | "memberOf"
  | "represents"
  | "relation"
  | "channel"
  | "clock"
  | "record"
  | "attachment"
  | "note"
  | "pin";
