/** The step name a person reads. The proof's own name is jargon; the wait is signing the request. */
export function plainBoundStep(step: string): string {
  return step.replace(/creating the DPoP proof/gi, "signing the request");
}
