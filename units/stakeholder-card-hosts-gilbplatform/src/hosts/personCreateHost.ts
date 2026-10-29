import type { PersonCreateHost } from "@kaigilb/gilbplatformcode-person-create";
import { adderCardOf } from "../adderCard";
import { rememberCreatedIn } from "../inline";

/**
 * The host of `person-create`. `adderCardOf` is the find half of GilbApp's (see `../adderCard`): a person with no card of their own in their
 * vault is told to make it first, where GilbApp made a basic one. `rememberCreatedIn` is the inline copy of `recordHooks.ts:2842`.
 */
export function createPersonCreateHost(): PersonCreateHost {
  return { adderCardOf, rememberCreatedIn };
}
