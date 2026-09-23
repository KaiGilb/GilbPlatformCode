import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckNameResult } from "./types";

export function VaultNameStep({
  suggestedName,
  webIdDomain = "",
  raceMessage = null,
  disabled = false,
  onNameChange,
  checkName,
}: {
  suggestedName: string;
  webIdDomain?: string;
  raceMessage?: string | null;
  disabled?: boolean;
  onNameChange: (name: string) => void;
  checkName: (name: string) => Promise<CheckNameResult>;
}) {
  const [name, setName] = useState(suggestedName);
  const [status, setStatus] = useState<CheckNameResult | null>(null);
  const [probing, setProbing] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeGen = useRef(0);

  useEffect(() => {
    setName(suggestedName);
    onNameChange(suggestedName);
  }, [suggestedName, onNameChange]);

  const probe = useCallback(
    async (raw: string) => {
      const gen = ++probeGen.current;
      setProbing(true);
      const result = await checkName(raw);
      if (gen !== probeGen.current) return;
      setStatus(result);
      setProbing(false);
    },
    [checkName],
  );

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!name.trim()) {
      setStatus(null);
      return;
    }
    debounce.current = setTimeout(() => {
      void probe(name);
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [name, probe]);

  const slug = (status?.name || name).toLowerCase().replace(/[^a-z0-9]/g, "") || "…";
  const address =
    status?.address ??
    (webIdDomain && (status?.name || name) ? `https://${slug}.${webIdDomain}/base` : null);

  return (
    <div className="gilb-signin-namestep" data-testid="vault-name-step">
      <label className="gilb-signin-label" htmlFor="gilb-signin-vault-name">
        Vault name
      </label>
      <input
        id="gilb-signin-vault-name"
        data-testid="vault-name-input"
        type="text"
        name="name"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          onNameChange(e.target.value);
        }}
        className="gilb-signin-input"
        aria-describedby="gilb-signin-vault-name-status"
      />
      <div id="gilb-signin-vault-name-status" className="gilb-signin-status" data-testid="vault-name-status">
        {raceMessage ? (
          <p className="gilb-signin-error-text" data-testid="vault-name-race">
            {raceMessage}
          </p>
        ) : null}
        {probing && !status ? <p className="gilb-signin-muted">Checking availability…</p> : null}
        {status?.reserved ? (
          <p className="gilb-signin-error-text" data-testid="vault-name-reserved">
            ✗ <strong>{status.name}</strong> is a reserved name — please choose another.
          </p>
        ) : null}
        {status && !status.reserved && status.available ? (
          <p data-testid="vault-name-available">
            ✓ <strong>{status.name}</strong> is available
            {address ? (
              <>
                {" "}
                — your address will be{" "}
                <code className="gilb-signin-code" data-testid="vault-name-address">
                  {address}
                </code>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
