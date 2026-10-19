/** The words the contact form draws. */
export interface ContactLabels {
  name: string;
  email: string;
  message: string;
  send: string;
  sending: string;
  sent: string;
  failed: string;
  /** The Company field's label (only drawn with `showCompany`). */
  company: string;
  /** Added after the label of a field that is not required. */
  optional: string;
}

/** The starter's own words, kept as they were. */
export const DEFAULT_CONTACT_LABELS: ContactLabels = {
  name: "Name",
  email: "Email",
  message: "Message",
  send: "Send message",
  sending: "Sending…",
  sent: "Thanks — your message was sent.",
  failed: "Something went wrong. Please try again.",
  company: "Company",
  optional: "(optional)",
};

/** What the form sends. `turnstileToken` is absent when no Turnstile widget answered. */
export interface ContactMessage {
  name: string;
  email: string;
  message: string;
  /** Present only when the form shows the Company field. */
  company?: string;
  turnstileToken?: string;
}
