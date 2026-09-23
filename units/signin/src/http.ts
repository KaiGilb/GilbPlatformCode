import {
  CodeRejectedError,
  SignInRefusedError,
  SignInUnreachableError,
  type CheckNameResult,
  type NamePrepResult,
} from "./types";

function join(origin: string, path: string): string {
  return `${origin.replace(/\/$/, "")}${path}`;
}

export async function requestSignInCode(
  origin: string,
  email: string,
  returnTo?: string,
  productName?: string,
): Promise<void> {
  let res: Response;
  try {
    const body: { email: string; return_to?: string } = { email: email.trim() };
    if (returnTo?.trim()) body.return_to = returnTo.trim();
    res = await fetch(join(origin, "/base/auth/email/request-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new SignInUnreachableError(productName);
  }
  if (!res.ok) throw new SignInRefusedError(res.status, productName);
}

export async function prepareVaultName(origin: string, email: string): Promise<NamePrepResult> {
  try {
    const res = await fetch(join(origin, "/onboard/api/name-prep"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { isReturning: false, suggestedName: "" };
    const body = (await res.json()) as Record<string, unknown>;
    return {
      isReturning: body.isReturning === true,
      suggestedName: typeof body.suggestedName === "string" ? body.suggestedName : undefined,
      webIdDomain: typeof body.webIdDomain === "string" ? body.webIdDomain : undefined,
      address: typeof body.address === "string" ? body.address : undefined,
    };
  } catch {
    return { isReturning: false, suggestedName: "" };
  }
}

export async function checkVaultName(origin: string, name: string): Promise<CheckNameResult> {
  try {
    const res = await fetch(join(origin, "/onboard/api/check-name"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        available: false,
        reserved: false,
        name,
        message: `Name check failed (HTTP ${res.status}).`,
      };
    }
    const body = (await res.json()) as Record<string, unknown>;
    return {
      available: body.available === true,
      reserved: body.reserved === true,
      name: typeof body.name === "string" ? body.name : name,
      address: typeof body.address === "string" ? body.address : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
    };
  } catch {
    return {
      available: false,
      reserved: false,
      name,
      message: "Could not check that name. Try again.",
    };
  }
}

export interface VerifyHttpBody {
  token?: string;
  principal?: string;
  needsVaultName?: boolean;
  suggestedName?: string;
}

export async function verifySignInCodeHttp(
  origin: string,
  email: string,
  code: string,
  dpopJwk: object,
  name?: string,
  productName?: string,
): Promise<VerifyHttpBody> {
  let res: Response;
  try {
    const body: Record<string, unknown> = {
      email: email.trim(),
      code: code.trim(),
      dpopJwk,
    };
    if (name?.trim()) body.name = name.trim();
    res = await fetch(join(origin, "/base/auth/email/verify-code"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new SignInUnreachableError(productName);
  }
  if (res.status === 401) throw new CodeRejectedError();
  if (!res.ok) throw new SignInRefusedError(res.status, productName);
  return (await res.json()) as VerifyHttpBody;
}
