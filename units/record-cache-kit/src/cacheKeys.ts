// The query-key prefixes the Plan card's caches share. Each was a string literal written out at more than one place in the app; here each has one definition.

/** The heads of the stakeholder-search entries of the authority pickers. Invalidated after an authority is written (the app wrote this literal at `PlanStakeholders.tsx:920` and `PlanFunctionForm.tsx:1468`). */
export const STAKEHOLDER_SEARCH_AUTHORITY_KEY = ["stakeholder-search", "authority"] as const;

/** Every plan-picker search entry of one vault (the app wrote `["plan-search", vault]` at `planSearch.ts:26`; `PlanTagLinks.tsx:58` builds its entries under the same head). */
export function planSearchKey(vaultId: string) {
  return ["plan-search", vaultId] as const;
}

/** Every plan-find entry of one vault (the app wrote `["plan-find", vault]` at `planFind.ts:371` and `PlanDescriptionParts.tsx:997`). */
export function planFindVaultKey(vaultId: string) {
  return ["plan-find", vaultId] as const;
}
