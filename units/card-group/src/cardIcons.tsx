/**
 * The small group icons of a record card. One stroke style, `currentColor`, 24x24, decorative (`aria-hidden`): the
 * group's TITLE carries the meaning, never the icon (colour-vision safe). There is no icon font; these are the one set.
 */
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

const PATHS: Record<CardIconName, string> = {
  name: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6",
  email: "M4 6h16v12H4zM4 7l8 6 8-6",
  phone: "M7 3h3l1.5 4-2 1.5a11 11 0 0 0 5 5L16 11.5l4 1.5v3a2 2 0 0 1-2 2A14 14 0 0 1 5 5a2 2 0 0 1 2-2Z",
  address: "M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  account: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  skill: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7Z",
  interest: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  language: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3Z",
  employment: "M4 8h16v11H4zM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16",
  memberOf: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3 2.7-5 6-5s6 2 6 5M16 5a3.2 3.2 0 0 1 0 6m2 4c2 .6 3 2.2 3 5",
  represents: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3 2.7-5 6-5 1.2 0 2.3.3 3.2.8M14 17h7m-3-3 3 3-3 3",
  relation: "M8 8h-1a4 4 0 0 0 0 8h1m8-8h1a4 4 0 0 1 0 8h-1M8 12h8",
  channel: "M4 5h16v11H9l-5 4Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2",
  record: "M4 5h9l7 7-8 8-8-8Zm4 3.5h.01",
  note: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  pin: "M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  attachment: "M20 11.5l-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7L10 17a1.7 1.7 0 0 1-2.4-2.4L14.6 7.6",
};

export function CardIcon({ name, className = "" }: { name: CardIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-card-icon={name}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
