// The write spellings of the employment link (a type only; the function that reads them is in employmentLinkVocab.ts).
export interface EmploymentLinkVocab {
  /** The write spelling of `a:employer`, `a:`-prefixed as the master serves it. */
  employer: string;
  /** The write spelling of `a:employee`. */
  employee: string;
}
