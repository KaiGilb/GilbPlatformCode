import type { PersonCreateHost } from "@kaigilb/gilbplatformcode-person-create";
import { adderCardOf } from "@kaigilb/gilbplatformcode-adder-card";
import { rememberCreatedIn } from "@kaigilb/gilbplatformcode-record-detail-reads";

/**
 * The host of `person-create`. `adderCardOf` is the one of `adder-card`: a person with no card of their own in their landing vault gets a basic
 * one, made through `vault-profile-photo`. `rememberCreatedIn` is the one of `record-detail-reads`.
 */
export function createPersonCreateHost(): PersonCreateHost {
  return { adderCardOf, rememberCreatedIn };
}
