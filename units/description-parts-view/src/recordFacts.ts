// The facts a create takes: bare slugs, with the vault-shaped value each slug can hold (a link or a list as well as text). `null` is not a
// create value: "no value" on a create is leaving the fact out.
export type RecordFactValue =
  | string
  | number
  | boolean
  | { readonly [key: string]: unknown }
  | readonly unknown[];
export type RecordCreateFacts = Record<string, RecordFactValue>;
