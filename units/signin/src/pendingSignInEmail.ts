const TTL_MS = 15 * 60 * 1000;

interface PendingPayload {
  email: string;
  at: number;
  codeSent: boolean;
  vaultName?: string;
}

function keyFor(appId: string): string {
  return `${appId}.pendingSignInEmail`;
}

function store(which: "session" | "local"): Storage | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    return which === "session" ? sessionStorage : localStorage;
  } catch {
    return undefined;
  }
}

function readFrom(storage: Storage | undefined, key: string): PendingPayload | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPayload>;
    if (typeof parsed.email !== "string" || !parsed.email.trim()) return null;
    if (typeof parsed.at !== "number" || !Number.isFinite(parsed.at)) return null;
    if (Date.now() - parsed.at > TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    const vaultName =
      typeof parsed.vaultName === "string" && parsed.vaultName.trim()
        ? parsed.vaultName.trim()
        : undefined;
    return {
      email: parsed.email.trim(),
      at: parsed.at,
      codeSent: parsed.codeSent === true,
      ...(vaultName ? { vaultName } : {}),
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function loadPendingSignInEmail(appId: string): PendingPayload | null {
  const key = keyFor(appId);
  return readFrom(store("session"), key) ?? readFrom(store("local"), key);
}

export function savePendingSignInEmail(appId: string, email: string, codeSent: boolean): void {
  const key = keyFor(appId);
  const trimmed = email.trim();
  if (!trimmed) {
    clearPendingSignInEmail(appId);
    return;
  }
  const payload = JSON.stringify({ email: trimmed, at: Date.now(), codeSent });
  for (const s of [store("session"), store("local")]) {
    try {
      s?.setItem(key, payload);
    } catch {
      /* private mode */
    }
  }
}

export function clearPendingSignInEmail(appId: string): void {
  const key = keyFor(appId);
  for (const s of [store("session"), store("local")]) {
    try {
      s?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
