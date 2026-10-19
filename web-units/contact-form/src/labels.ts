/** The words the contact form draws. */
export interface ContactLabels {
  name: string;
  email: string;
  message: string;
  send: string;
  sending: string;
  sent: string;
  failed: string;
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
};

/** What the form sends. `turnstileToken` is absent when no Turnstile widget answered. */
export interface ContactMessage {
  name: string;
  email: string;
  message: string;
  turnstileToken?: string;
}
