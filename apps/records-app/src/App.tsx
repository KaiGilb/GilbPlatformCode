import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SignInCard } from "@kaigilb/gilbplatformcode-signin";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-signin/session";
import { pickContactActions } from "@kaigilb/gilbplatformcode-contact-actions";
import type { ColorSchemePreference } from "@kaigilb/gilbplatformcode-color-scheme";
import { credential, findMyVault, signInApp, signInAuth, type AppVault } from "./platform";
import { createProfileCard, cardHolds, createsAllowed, profileWritesAllowed, addEntry, listEntries, loadProfile, photoObjectUrl, saveProfile, searchEntries, setProfilePhoto, type Entry, type OwnCard, type ProfileState, type SaveResult } from "./data";
import { loadPreference, nextPreference, setPreference, systemQuery } from "./theme";
import { signOut } from "./signOut";

type View = { kind: "list" } | { kind: "card"; entry: Entry } | { kind: "profile" };

export function App() {
  const qc = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const [checked, setChecked] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    // A sign-in kept by the session bridge survives a reload. Only "no session" means the quiet card;
    // any other failure (origin not admitted, network) is shown.
    credential.getSession().then(
      () => setSignedIn(true),
      (e) => { if (!(e instanceof NotSignedInError)) setSessionError((e as Error).message); },
    ).finally(() => setChecked(true));
  }, []);

  if (!checked) return <p className="muted" style={{ padding: 16 }}>Loading…</p>;
  if (!signedIn) {
    return (
      <div className="signin card">
        {sessionError && <p className="error" role="alert">{sessionError}</p>}
        <SignInCard app={signInApp} auth={signInAuth} onSignedIn={() => { setSessionError(null); setSignedIn(true); }} />
      </div>
    );
  }
  // Server logout, key dropped and cache cleared BEFORE the signed-out view renders.
  return <Signed onSignOut={() => { void signOut(qc, credential).then(() => setSignedIn(false)); }} />;
}

function ThemeToggle() {
  const [pref, setPref] = useState<ColorSchemePreference>(loadPreference());
  useEffect(() => {
    if (pref !== "system") return;
    const mql = systemQuery();
    if (!mql) return;
    const follow = () => setPreference("system");
    mql.addEventListener("change", follow);
    return () => mql.removeEventListener("change", follow);
  }, [pref]);
  return (
    <button
      aria-label="Colour mode"
      onClick={() => {
        const n = nextPreference(pref);
        setPreference(n);
        setPref(n);
      }}
    >
      Mode: {pref}
    </button>
  );
}

const PROFILE_OFF_NOTICE = "Changing your profile is off in this run.";
const NO_OWN_VAULT = "Your own vault was not found among the vaults you reach.";

/** The label of a vault: the row's name, else the host. */
export function vaultLabel(v: { vaultId: string; name?: string | null }): string {
  if (v.name) return v.name;
  try { return new URL(v.vaultId).hostname; } catch { return v.vaultId; }
}

/** One face of the header: the card photo of this vault's own card (loadProfile + photoObjectUrl), else the fallback. Read only. */
function VaultFacePhoto({ vault, fallback, small }: { vault: AppVault; fallback?: ReactNode; small?: boolean }) {
  const profile = useQuery({ queryKey: ["profile", vault.vaultId], queryFn: () => loadProfile(vault) });
  const location = profile.data?.kind === "card" ? profile.data.card.photo : "";
  return <Avatar vaultId={vault.vaultId} location={location} small={small} fallback={fallback} />;
}

function Signed({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = useState<View>({ kind: "list" });
  const vault = useQuery({ queryKey: ["vault"], queryFn: () => findMyVault() });
  const recordsVault = vault.data?.recordsVault ?? null;
  const profileVault = vault.data?.profileVault ?? null;
  const vaultId = recordsVault?.vaultId;
  return (
    <>
      <header>
        {profileVault && (
          <button className="face" aria-label="Your own card" onClick={() => setView({ kind: "profile" })}>
            <VaultFacePhoto vault={profileVault} small />
          </button>
        )}
        <h1>Records</h1>
        {recordsVault && (
          <div className="face vault-face" aria-label={`Vault ${vaultLabel(recordsVault)}`}>
            <VaultFacePhoto vault={recordsVault} small fallback={<span className="initial" aria-hidden="true">{vaultLabel(recordsVault).charAt(0).toUpperCase()}</span>} />
            <span>{vaultLabel(recordsVault)}</span>
          </div>
        )}
        <nav>
          <button onClick={() => setView({ kind: "list" })}>Records</button>
          <button onClick={() => setView({ kind: "profile" })}>Profile</button>
        </nav>
        <ThemeToggle />
        <button onClick={onSignOut}>Sign out</button>
      </header>
      <main>
        {vault.isLoading && <p className="muted">Finding your vault…</p>}
        {vault.error && <p className="error" role="alert">{(vault.error as Error).message}</p>}
        {vault.data && !recordsVault && view.kind !== "profile" && <p className="error" role="alert">You have no vault you can write to.</p>}
        {vaultId && view.kind === "list" && <RecordList vaultId={vaultId} onOpen={(entry) => setView({ kind: "card", entry })} />}
        {vaultId && view.kind === "card" && <RecordCard entry={view.entry} onBack={() => setView({ kind: "list" })} />}
        {vault.data && view.kind === "profile" && (profileVault ? <ProfileView vault={profileVault} recordsVault={recordsVault} /> : <p className="error" role="alert">{NO_OWN_VAULT}</p>)}
      </main>
    </>
  );
}

const NO_CREATE_NOTICE = "This run changes existing records only. Adding records and pictures is off.";

export function RecordList({ vaultId, onOpen }: { vaultId: string; onOpen: (t: Entry) => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const inFlight = useRef(false);
  const canCreate = createsAllowed(vaultId);
  const entries = useQuery({ queryKey: ["entries", vaultId], queryFn: () => listEntries(vaultId) });
  const shown = searchEntries(entries.data ?? [], query);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return; // a second press or Enter while the create is on the wire
    inFlight.current = true;
    setPending(true);
    setError(null);
    setAdded(false);
    try {
      const made = await addEntry(vaultId, name, description);
      await qc.invalidateQueries({ queryKey: ["entries", vaultId] });
      if (made.confirmed) {
        setName("");
        setDescription("");
        setAdded(true);
      } else setError("The vault did not confirm the record.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      {!canCreate ? <p className="muted">{NO_CREATE_NOTICE}</p> : (
      <form className="card" onSubmit={add} aria-label="Add a record">
        <label htmlFor="rec-name">Name</label>
        <input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="rec-desc">Description</label>
        <textarea id="rec-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        {added && <p role="status">Record added.</p>}
        <p><button className="primary" type="submit" disabled={pending}>Add record</button></p>
      </form>
      )}
      <label htmlFor="rec-search">Search records</label>
      <input id="rec-search" type="search" placeholder="Search name or description" value={query} onChange={(e) => setQuery(e.target.value)} />
      {entries.isLoading && <p className="muted">Loading records…</p>}
      {entries.error && <p className="error" role="alert">{(entries.error as Error).message}</p>}
      <ul className="list">
        {shown.map((t) => (
          <li key={t.id}>
            <button className="card row" onClick={() => onOpen(t)}>
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          </li>
        ))}
      </ul>
      {entries.data && shown.length === 0 && <p className="muted">{query ? "No record matches." : canCreate ? "No records yet. Add the first one above." : "No records yet."}</p>}
    </>
  );
}

export function RecordCard({ entry, onBack }: { entry: Entry; onBack: () => void }) {
  return (
    <article className="card" aria-label="Record">
      <button onClick={onBack}>Back to records</button>
      <h2>{entry.name}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{entry.description || <span className="muted">No description.</span>}</p>
    </article>
  );
}

export function Avatar({ vaultId, location, small, fallback }: { vaultId: string; location: string; small?: boolean; fallback?: ReactNode }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    if (!location) { setSrc(null); return; } // no photo fact: nothing to fetch, never a guessed image
    photoObjectUrl(vaultId, location).then(
      (u) => { if (live) { made = u; setSrc(u); } else if (u) URL.revokeObjectURL(u); },
      () => undefined,
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made); // on change and on unmount
    };
  }, [vaultId, location]);
  const cls = small ? "avatar sm" : "avatar";
  if (src) return <img className={cls} src={src} alt="Profile picture" />;
  if (fallback) return <>{fallback}</>;
  return <div className={cls} role="img" aria-label="No picture" />;
}

export function ProfileView({ vault, recordsVault = null }: { vault: AppVault; recordsVault?: AppVault | null }) {
  const profile = useQuery({ queryKey: ["profile", vault.vaultId], queryFn: () => loadProfile(vault) });
  // Kept here, not in the form: the form is re-keyed when the card appears, and its message must survive that.
  const [status, setStatus] = useState<Status>({ msg: null, err: null });
  if (profile.isLoading) return <p className="muted">Loading profile…</p>;
  if (profile.error) return <p className="error" role="alert">{(profile.error as Error).message}</p>;
  const state = profile.data!;
  return (
    <>
      <h2>Your card</h2>
      <p className="muted">in {vaultLabel(vault)}</p>
      {state.kind === "card" && state.otherOwnerCards.length > 0 && (
        <p className="error" role="status">Warning: this vault holds more than one card that looks like yours ({state.otherOwnerCards.join(", ")}). Nothing was changed.</p>
      )}
      <ProfileForm
        key={state.kind === "card" ? state.card.id : "none"}
        vault={vault}
        card={state.kind === "card" ? state.card : null}
        status={status}
        setStatus={setStatus}
        refetch={async () => (await profile.refetch()).data}
      />
      <section className="card" aria-label="Connection">
        <h2>Connection</h2>
        <p>Vaults reached: {vault.reachCount ?? "unknown"}</p>
        <p>Records vault: {recordsVault ? `${recordsVault.vaultId} (${(recordsVault.modes ?? []).join(", ") || "no modes"})` : "none"}</p>
        <p>Profile vault: {vault.vaultId} ({(vault.modes ?? []).join(", ") || "no modes"})</p>
        <p>Own card road: {state.kind === "card" ? state.card.road : "none"}</p>
        <p>Own card id: {state.kind === "card" ? state.card.id : "none"}</p>
      </section>
    </>
  );
}

interface Status { msg: string | null; err: string | null }

function ProfileForm({ vault, card, status, setStatus, refetch }: { vault: AppVault; card: OwnCard | null; status: Status; setStatus: (s: Status) => void; refetch: () => Promise<ProfileState | undefined> }) {
  const vaultId = vault.vaultId;
  const [f, setF] = useState({ name: card?.name ?? "", email: card?.email ?? "", phone: card?.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const actions = pickContactActions({ phones: [f.phone], emails: [f.email], socials: [] });
  const off = card === null;
  const canWrite = profileWritesAllowed(vault);

  async function run(fn: () => Promise<SaveResult | void>, done: string) {
    setStatus({ msg: null, err: null });
    try {
      const r = await fn();
      await refetch(); // the avatar and the fields show what the vault now holds
      if (r && !r.confirmed) setStatus({ msg: null, err: `The vault did not confirm the change: ${r.failed.join(", ")}` });
      else setStatus({ msg: done, err: null });
    } catch (e) { setStatus({ msg: null, err: (e as Error).message }); }
  }

  /** Create the card through the self-card door, refetch the own-card finding, and say "created" only if it holds the typed values. */
  async function create() {
    if (inFlight.current) return; // a second press or Enter while the create is on the wire
    inFlight.current = true;
    setBusy(true);
    setStatus({ msg: null, err: null });
    try {
      const made = await createProfileCard(vault, f);
      const after = await refetch();
      if (made.save && !made.save.confirmed) setStatus({ msg: null, err: `The vault did not confirm the change: ${made.save.failed.join(", ")}` });
      else if (after?.kind === "card" && cardHolds(after.card, f)) setStatus({ msg: "Profile created.", err: null });
      else setStatus({ msg: null, err: "The vault did not confirm the profile card." });
    } catch (e) {
      setStatus({ msg: null, err: (e as Error).message });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="card" aria-label="Profile" onSubmit={(e) => { e.preventDefault(); if (!canWrite) return; if (card) void run(() => saveProfile(vault, card, f), "Profile saved."); else void create(); }}>
      {off && <p className="error" role="alert">No profile card was found in your vault.</p>}
      <Avatar vaultId={vaultId} location={card?.photo ?? ""} />
      {!canWrite ? <p className="muted">{PROFILE_OFF_NOTICE}</p> : (<>
      <label htmlFor="pic">Profile picture</label>
      <input id="pic" type="file" accept="image/*" disabled={off} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void run(() => setProfilePhoto(vault, card, file), "Picture saved."); }} />
      {off && <p className="muted">Create your profile card first.</p>}
      </>)}
      <label htmlFor="p-name">Name</label>
      <input id="p-name" readOnly={!canWrite} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <label htmlFor="p-email">Email{card && card.moreEmails > 0 ? ` (first of ${card.moreEmails + 1}; the others are kept)` : ""}</label>
      <input id="p-email" readOnly={!canWrite} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <label htmlFor="p-phone">Phone{card && card.morePhones > 0 ? ` (first of ${card.morePhones + 1}; the others are kept)` : ""}</label>
      <input id="p-phone" readOnly={!canWrite} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      {actions.length > 0 && <p>{actions.map((a) => <a key={a.kind} href={a.href} style={{ marginRight: 12 }}>{a.label}</a>)}</p>}
      {status.err && <p className="error" role="alert">{status.err}</p>}
      {status.msg && <p role="status">{status.msg}</p>}
      {canWrite && <p>{card ? <button className="primary" type="submit">Save profile</button> : <button className="primary" type="submit" disabled={busy}>Create my profile card</button>}</p>}
    </form>
  );
}
