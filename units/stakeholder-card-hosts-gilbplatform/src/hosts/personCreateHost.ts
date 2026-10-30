import type { PersonCreateHost } from "@kaigilb/gilbplatformcode-person-create";
import { adderCardOf } from "../adderCard";
import { rememberCreatedIn } from "../inline";

/**
 * The host of `person-create`. `adderCardOf` is GilbApp's (see `../adderCard`): a person with no card of their own in their
 * landing vault gets a basic one, made through `vault-profile-photo`. `rememberCreatedIn` is the inline copy of `recordHooks.ts:2842`.
 */
export function createPersonCreateHost(): PersonCreateHost {
  return { adderCardOf, rememberCreatedIn };
}
