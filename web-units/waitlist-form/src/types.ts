/**
 * A waiting-list question. The same value is what the form draws and what `validate` checks,
 * so the host's server can import it and refuse anything the form would refuse.
 */
export type WaitlistField =
  | {
      name: string;
      kind: "text" | "email" | "tel";
      label: string;
      help?: string;
      required?: boolean;
      maxLength?: number;
      autocomplete?: string;
      /** Hint text inside the empty control. */
      placeholder?: string;
    }
  | {
      name: string;
      kind: "textarea";
      label: string;
      help?: string;
      required?: boolean;
      maxLength?: number;
      rows?: number;
      /** Hint text inside the empty control. */
      placeholder?: string;
    }
  | {
      name: string;
      kind: "choice";
      label: string;
      required?: boolean;
      options: WaitlistChoiceOption[];
      /** Selected on first draw when it is one of `options`. */
      defaultValue?: string;
      /** How the answers are drawn: "tiles" (a card per answer, with its help line) or "pills" (a row of rounded buttons, label only). Default "tiles". */
      look?: "tiles" | "pills";
      /** Tiles only: 2 puts the tiles in two columns from 640px wide. Default 1. */
      columns?: 1 | 2;
    };

/** One answer in a choice question. `help` is the one line under that answer. */
export interface WaitlistChoiceOption {
  value: string;
  label: string;
  help?: string;
}

/**
 * The words the form draws that are not a field's own label.
 * `tooLong` may contain `{max}`, replaced with the field's maximum.
 */
export interface WaitlistLabels {
  submit: string;
  sending: string;
  optional: string;
  sentHeading: string;
  sentBody: string;
  failed: string;
  invalidEmail: string;
  required: string;
  tooLong: string;
}

/** Neutral English. A host replaces any of them. */
export const DEFAULT_WAITLIST_LABELS: WaitlistLabels = {
  submit: "Join the waiting list",
  sending: "Sending…",
  optional: "(optional)",
  sentHeading: "You're on the list.",
  sentBody: "We will write when there is room.",
  failed: "That did not go through. Your answers are kept; please try again.",
  invalidEmail: "Enter an email address like name@example.com.",
  required: "This one is needed.",
  tooLong: "This is longer than {max} characters.",
};

/**
 * The collection notice above the button. Not a checkbox.
 * `text` is the sentence; the optional link is an anchor after it; `after` follows the link with no space.
 * The body stores the words that were shown (the sentence, the link's words when the link is drawn, then `after`).
 */
export interface WaitlistNotice {
  text: string;
  linkLabel?: string;
  linkHref?: string;
  /** Text right after the link, with no space before it (for example "."). Also sent in the body's notice. */
  after?: string;
}

/**
 * Name, email and the idea before company and team size: a person on their own meets
 * the personal questions first. "Not yet" is the first experience answer; none is chosen until the person chooses one.
 * Lengths: name 80, email 254, idea 1000, company 120.
 */
export const defaultWaitlistFields: WaitlistField[] = [
  { name: "name", kind: "text", label: "Name", maxLength: 80, autocomplete: "name" },
  { name: "email", kind: "email", label: "Email", required: true, maxLength: 254, autocomplete: "email" },
  { name: "idea", kind: "textarea", label: "What would you like to build?", maxLength: 1000, rows: 4 },
  { name: "company", kind: "text", label: "Company", maxLength: 120, autocomplete: "organization" },
  {
    name: "teamSize",
    kind: "choice",
    label: "Team size",
    look: "pills",
    options: [
      { value: "just-me", label: "Just me" },
      { value: "2-10", label: "2 to 10" },
      { value: "11-50", label: "11 to 50" },
      { value: "50-plus", label: "50 or more" },
    ],
  },
  {
    name: "experience",
    kind: "choice",
    label: "Experience building apps",
    look: "tiles",
    columns: 2,
    options: [
      { value: "not-yet", label: "Not yet" },
      { value: "a-little", label: "A little" },
      { value: "with-ai", label: "With AI" },
      { value: "i-code", label: "I code" },
    ],
  },
];
