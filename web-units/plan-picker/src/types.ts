/** One plan card. `name` is the value of the pick and the card's key, so keep names distinct. */
export interface Plan {
  name: string;
  /** The price as shown, e.g. "From 4 900". Plain text. */
  price: string;
  features: string[];
  /** The plan that starts picked when nothing else is chosen. */
  featured?: boolean;
  /** A short line above the name on the featured card, e.g. "Most chosen". */
  featuredNote?: string;
}

/** One one-off add-on. */
export interface Extra {
  name: string;
  price: string;
  body?: string;
}

/** The collapsed list of one-off add-ons under the plans. All texts are the host's; none is built in. */
export interface Extras {
  heading?: string;
  /** One line shown on the closed row. */
  teaser?: string;
  /** The lowest price, shown on the closed row. */
  fromPrice?: string;
  /** The cue on the closed row, e.g. "See all extras". */
  openLabel?: string;
  /** The cue on the open row, e.g. "Hide extras". */
  closeLabel?: string;
  /** A line above the list when open. */
  body?: string;
  items: Extra[];
}

/** What the unit tells the host about the pick. `byVisitor` is false for the featured default a visitor never touched. */
export interface PlanPick {
  plan: string;
  byVisitor: boolean;
}
