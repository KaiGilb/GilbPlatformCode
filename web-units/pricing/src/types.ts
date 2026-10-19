/**
 * One plan of a pricing table. `price` is shown as written (for example "$29"); `period` follows it
 * after a slash ("mo" draws "/mo"). The button shows only with `ctaLabel`, and goes to `ctaTo`
 * (default `/contact`). At most one plan is usually `featured`.
 */
export interface Plan {
  name: string;
  price: string;
  period?: string;
  features: string[];
  ctaLabel?: string;
  ctaTo?: string;
  featured?: boolean;
}
