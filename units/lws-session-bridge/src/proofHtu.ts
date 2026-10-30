// A NAMED COPY, not an import: `proofHtu` of `units/request-htu/src/requestHtu.ts` at main d65985d, copied verbatim (compared with
// comments stripped, the function is token-equal to the source). Copied rather than depended on so that a unit that installs this
// bridge as source needs no extra package. If `request-htu` changes `proofHtu`, change this copy to match.

export function proofHtu(fetchUrl: string, explicitOrigin?: string | null): string {
  const target = new URL(fetchUrl);
  if (explicitOrigin != null) {
    return `${new URL(explicitOrigin).origin}${target.pathname}`;
  }
  return `https://${target.host}${target.pathname}`;
}
