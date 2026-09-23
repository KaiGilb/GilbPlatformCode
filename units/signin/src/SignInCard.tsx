import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { VaultNameStep } from "./VaultNameStep";
import {
  clearPendingSignInEmail,
  loadPendingSignInEmail,
  savePendingSignInEmail,
} from "./pendingSignInEmail";
import {
  CodeRejectedError,
  SignInRefusedError,
  SignInUnreachableError,
  type SignInApp,
  type SignInAuth,
} from "./types";

function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

type Step = "email" | "code" | "vault-name";

/**
 * Shared email one-time-code sign-in card.
 * Host injects `app` (id / origin / returnTo) and `auth`. This unit does not pick a vault host.
 */
export function SignInCard({
  app,
  auth,
  onSignedIn,
  finishVaultName = false,
  compact = false,
  banner,
  onOfferPasskey,
  initialEmail = "",
}: {
  app: SignInApp;
  auth: SignInAuth;
  onSignedIn: () => void;
  finishVaultName?: boolean;
  compact?: boolean;
  banner?: ReactNode;
  onOfferPasskey?: (signal: AbortSignal) => Promise<{ signedIn?: boolean } | void>;
  initialEmail?: string;
}) {
  const pending = loadPendingSignInEmail(app.id);
  const [step, setStep] = useState<Step>(
    finishVaultName ? "vault-name" : pending?.codeSent ? "code" : "email",
  );
  const [email, setEmail] = useState(pending?.email ?? initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(finishVaultName);
  const [suggestedName, setSuggestedName] = useState(pending?.vaultName ?? "");
  // Host-agnostic: domain comes from prepareName, never a baked vault host.
  const [webIdDomain, setWebIdDomain] = useState("");
  const [chosenName, setChosenName] = useState(pending?.vaultName ?? "");
  const [raceMessage, setRaceMessage] = useState<string | null>(null);
  const [postVerifyNameOnly, setPostVerifyNameOnly] = useState(finishVaultName);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const requestingFor = useRef<string | null>(null);
  const verifyingFor = useRef<string | null>(null);
  const creatingName = useRef(false);

  useEffect(() => {
    if (step === "vault-name" || postVerifyNameOnly) return;
    const el = step === "email" ? emailRef.current : codeRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, [step, postVerifyNameOnly]);

  useEffect(() => {
    if (step !== "email" || !onOfferPasskey) return;
    const ac = new AbortController();
    void onOfferPasskey(ac.signal)
      .then((result) => {
        if (result?.signedIn) onSignedIn();
      })
      .catch(() => {
        /* email path stays the floor */
      });
    return () => ac.abort();
  }, [step, onOfferPasskey, onSignedIn]);

  const rememberChosenName = useCallback(
    (n: string) => {
      setChosenName(n);
      const trimmed = email.trim();
      if (trimmed) auth.onNameAttached?.(trimmed, n);
    },
    [auth, email],
  );

  const land = useCallback(() => {
    clearPendingSignInEmail(app.id);
    onSignedIn();
  }, [app.id, onSignedIn]);

  const submitEmail = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!looksLikeEmail(trimmed)) {
        setError("Enter your email first.");
        return;
      }
      if (requestingFor.current === trimmed || busy) return;
      requestingFor.current = trimmed;
      setBusy(true);
      setError(null);
      try {
        await auth.requestCode(trimmed, app.returnTo());
        savePendingSignInEmail(app.id, trimmed, true);
        setPostVerifyNameOnly(false);
        setRaceMessage(null);
        setStep("code");
        setCode("");
        setBusy(false);
        requestingFor.current = null;
        void auth
          .prepareName(trimmed)
          .then((prep) => {
            if (prep.isReturning) {
              setNeedsName(false);
              setSuggestedName("");
              setChosenName("");
              return;
            }
            if (prep.suggestedName) {
              setNeedsName(true);
              setSuggestedName(prep.suggestedName);
              setChosenName((prev) => prev || prep.suggestedName!);
              if (prep.webIdDomain) setWebIdDomain(prep.webIdDomain);
            }
          })
          .catch(() => {
            /* verify-code can still return needsVaultName */
          });
      } catch (e) {
        const msg =
          e instanceof SignInUnreachableError || e instanceof SignInRefusedError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not send a code. Try again.";
        setError(msg);
      } finally {
        setBusy(false);
        requestingFor.current = null;
      }
    },
    [app, auth, busy],
  );

  const submitNamedVault = useCallback(async () => {
    const name = chosenName.trim();
    if (!name || creatingName.current) return;
    creatingName.current = true;
    setBusy(true);
    setError(null);
    try {
      await auth.completeNamedVault(name);
      land();
    } catch (e) {
      setRaceMessage(e instanceof Error ? e.message : "Could not create your vault. Try again.");
    } finally {
      setBusy(false);
      creatingName.current = false;
    }
  }, [auth, chosenName, land]);

  const submitCode = useCallback(
    async (rawCode: string) => {
      const digits = rawCode.replace(/\s/g, "");
      if (digits.length !== 6) return;
      if (verifyingFor.current === digits) return;
      const trimmedEmail = email.trim();
      if (!looksLikeEmail(trimmedEmail)) {
        setError("Enter your email first.");
        setStep("email");
        return;
      }
      if (needsName && !chosenName.trim()) {
        setError("Choose a vault name first.");
        return;
      }
      verifyingFor.current = digits;
      setBusy(true);
      setError(null);
      try {
        const result = await auth.verifyCode(
          trimmedEmail,
          digits,
          needsName ? chosenName.trim() : undefined,
        );
        if (result.needsVaultName) {
          setPostVerifyNameOnly(true);
          setStep("vault-name");
          if (result.suggestedName) {
            setSuggestedName(result.suggestedName);
            setChosenName(result.suggestedName);
          }
          setCode("");
          verifyingFor.current = null;
          return;
        }
        land();
      } catch (e) {
        const msg =
          e instanceof CodeRejectedError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Sign-in failed. Request a new code.";
        setError(msg);
        setCode("");
        verifyingFor.current = null;
      } finally {
        setBusy(false);
      }
    },
    [auth, email, needsName, chosenName, land],
  );

  useEffect(() => {
    if (step !== "code" || postVerifyNameOnly) return;
    const digits = code.replace(/\s/g, "");
    if (digits.length === 6) void submitCode(digits);
  }, [code, step, submitCode, postVerifyNameOnly]);

  const description =
    step === "email"
      ? "Sign in to your account, or create a new account"
      : postVerifyNameOnly || step === "vault-name"
        ? "Create your vault — choose a name (you can change the suggestion)."
        : needsName
          ? "Choose a vault name, then enter the code from your email."
          : "Enter code from email.";

  return (
    <div
      className="gilb-signin-card"
      data-testid="sign-in-card"
      data-app={app.id}
      data-affordance-count="1"
    >
      {compact ? null : (
        <div className="gilb-signin-header">
          <h2 className="gilb-signin-title">{app.title}</h2>
          <p className="gilb-signin-desc">{description}</p>
        </div>
      )}
      <div className="gilb-signin-body">
        {banner}
        {step === "email" ? (
          <div className="gilb-signin-stack">
            <label className="sr-only" htmlFor={`gilb-signin-email-${app.id}`}>
              Email
            </label>
            <input
              ref={emailRef}
              id={`gilb-signin-email-${app.id}`}
              data-testid="sign-in-email"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              placeholder="you@domain.com"
              value={email}
              disabled={busy}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitEmail(email);
                }
              }}
              className="gilb-signin-input"
            />
            <button
              type="button"
              data-testid="sign-in-send-code"
              disabled={busy || !looksLikeEmail(email)}
              onClick={() => void submitEmail(email)}
              className="gilb-signin-btn"
            >
              {busy ? "Sending a code…" : "Send Code to Email"}
            </button>
          </div>
        ) : (
          <div className="gilb-signin-stack">
            {!postVerifyNameOnly && step !== "vault-name" ? (
              <p className="gilb-signin-muted" data-testid="sign-in-email-echo">
                Code sent to <span style={{ fontWeight: 500, color: "inherit" }}>{email}</span>
                {" · "}
                <button
                  type="button"
                  className="gilb-signin-link"
                  data-testid="sign-in-change-email"
                  onClick={() => {
                    clearPendingSignInEmail(app.id);
                    setStep("email");
                    setCode("");
                    setError(null);
                    setNeedsName(false);
                    setPostVerifyNameOnly(false);
                    setRaceMessage(null);
                  }}
                >
                  Change email
                </button>
              </p>
            ) : (
              <p className="gilb-signin-muted" data-testid="sign-in-email-echo">
                {email ? (
                  <>
                    Signed in as <span style={{ fontWeight: 500 }}>{email}</span> — name your vault
                    to continue.
                  </>
                ) : (
                  "Name your vault to continue."
                )}
              </p>
            )}

            {(needsName || postVerifyNameOnly || step === "vault-name") && (
              <VaultNameStep
                suggestedName={suggestedName}
                webIdDomain={webIdDomain}
                raceMessage={raceMessage}
                disabled={busy}
                onNameChange={rememberChosenName}
                checkName={auth.checkName}
              />
            )}

            {!postVerifyNameOnly && step !== "vault-name" ? (
              <>
                <input
                  ref={codeRef}
                  id={`gilb-signin-code-${app.id}`}
                  data-testid="sign-in-code"
                  type="text"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus={!needsName}
                  maxLength={6}
                  placeholder="6-digit code"
                  value={code}
                  disabled={busy}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setError(null);
                  }}
                  className="gilb-signin-input gilb-signin-code-input"
                />
                {busy ? (
                  <p className="gilb-signin-muted" role="status" data-testid="sign-in-status">
                    Signing in…
                  </p>
                ) : (
                  <p className="gilb-signin-muted">
                    Or press the button in the email to open {app.productName} signed in.
                  </p>
                )}
              </>
            ) : (
              <div data-testid="vault-name-continue">
                <button
                  type="button"
                  data-testid="create-vault-button"
                  disabled={busy || !chosenName.trim()}
                  onClick={() => void submitNamedVault()}
                  className="gilb-signin-btn"
                >
                  {busy ? "Creating your vault…" : "Create my vault"}
                </button>
              </div>
            )}
          </div>
        )}
        {error ? (
          <p role="alert" className="gilb-signin-alert" data-testid="sign-in-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
