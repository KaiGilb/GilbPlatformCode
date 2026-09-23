/**
 * Host-injected app identity for the shared email one-time-code card.
 * Origin and returnTo come from the taking app — never baked in this unit.
 */
export interface SignInApp {
  /** Storage prefix, e.g. "gilbapp" | "mynet". */
  id: string;
  /** Short product name in helper copy, e.g. "GilbApp". */
  productName: string;
  /** Card title. */
  title: string;
  /** Vault-server origin, no trailing slash. Injected by the host. */
  origin: string;
  /** Absolute URL branded into the one-time-code email. */
  returnTo: () => string;
}

export interface NamePrepResult {
  isReturning: boolean;
  suggestedName?: string;
  webIdDomain?: string;
  address?: string;
}

export interface CheckNameResult {
  available: boolean;
  reserved: boolean;
  name: string;
  address?: string;
  message?: string;
}

export interface VerifySignInResult {
  needsVaultName: boolean;
  suggestedName?: string;
}

/** Host-supplied auth. HTTP helpers in this package cover request/prep/check/verify. */
export interface SignInAuth {
  requestCode: (email: string, returnTo?: string) => Promise<void>;
  verifyCode: (email: string, code: string, name?: string) => Promise<VerifySignInResult>;
  prepareName: (email: string) => Promise<NamePrepResult>;
  checkName: (name: string) => Promise<CheckNameResult>;
  completeNamedVault: (name: string) => Promise<void>;
  /** MyNet: attach the chosen name to the pending OTC so the email button mints this vault. */
  onNameAttached?: (email: string, name: string) => void;
}

export class CodeRejectedError extends Error {
  constructor() {
    super(
      "That code did not work. Codes are single-use and expire after 10 minutes — request a new one.",
    );
    this.name = "CodeRejectedError";
  }
}

export class SignInUnreachableError extends Error {
  constructor(productName = "the app") {
    super(`Could not reach ${productName}. Check the connection, then try again.`);
    this.name = "SignInUnreachableError";
  }
}

export class SignInRefusedError extends Error {
  readonly status: number;
  constructor(status: number, productName = "the app") {
    super(`${productName} refused the sign-in (HTTP ${status}). Wait a moment, then try again.`);
    this.name = "SignInRefusedError";
    this.status = status;
  }
}
