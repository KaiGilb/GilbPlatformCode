import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";

/** GilbVeda `t/PublicGrantee` — the platform's WHO=everyone value. */
export function publicGrantee(): string {
  return `${termOrigin()}/base/t/PublicGrantee`;
}

/** True when a grantee string IS the public marker. ⛔ EXACT equality, as the platform compares
 *  (RuleAudreadExactEqualityOnly): a near-miss spelling is not public
 *  there, so it must never be shown as "Everyone" here. */
export function isPublicPrincipal(principal: string | null | undefined): boolean {
  return principal === publicGrantee();
}
