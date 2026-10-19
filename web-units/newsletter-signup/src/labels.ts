/** The words the newsletter signup draws besides its heading, line and button. */
export interface NewsletterLabels {
  /** The email field's label, read by screen readers (it is visually hidden). */
  email: string;
  placeholder: string;
  subscribed: string;
  failed: string;
}

/** The starter's own words, kept as they were. */
export const DEFAULT_NEWSLETTER_LABELS: NewsletterLabels = {
  email: "Email",
  placeholder: "you@example.com",
  subscribed: "You're subscribed — thanks!",
  failed: "Something went wrong. Try again.",
};
