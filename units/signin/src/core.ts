// The HEADLESS core — every export here is framework-agnostic.
//
// ── Why this entry point exists ──────────────────────────────────────────────────────────────
// `./index` re-exports the React `SignInCard`, so importing it drags React in. A host that is not
// React (Vue, Svelte, vanilla, a native shell) needs the SAME wire contract without the card, and
// the alternative — each host re-deriving the HTTP calls — is exactly what
// `Rule_Code_gilb-app-stack-and-data#RuleBaseappAuthSdk` forbids ("apps SHARE the login, they do
// not build it from scratch ... do not fork the auth flow into an app").
//
// ⚠ Nothing in this file, or in the three modules it re-exports, imports React. Verified
// 2026-09-21: `http.ts`, `types.ts` and `pendingSignInEmail.ts` contain zero React references and
// `http.ts` imports only `./types`. Keep it that way — a React import reached from here silently
// re-imposes the dependency this entry point exists to remove.
//
// The host supplies its own UI and its own token holder; the contract it must satisfy is
// `SignInAuth` in `./types`.

export {
  requestSignInCode,
  prepareVaultName,
  checkVaultName,
  verifySignInCodeHttp,
} from "./http";
export {
  loadPendingSignInEmail,
  savePendingSignInEmail,
  clearPendingSignInEmail,
} from "./pendingSignInEmail";
export {
  CodeRejectedError,
  SignInUnreachableError,
  SignInRefusedError,
} from "./types";
export type {
  SignInApp,
  SignInAuth,
  NamePrepResult,
  CheckNameResult,
  VerifySignInResult,
} from "./types";
