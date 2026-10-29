import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SignInCard } from "@kaigilb/gilbplatformcode-signin";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-signin/session";
import { pickContactActions } from "@kaigilb/gilbplatformcode-contact-actions";
import type { ColorSchemePreference } from "@kaigilb/gilbplatformcode-color-scheme";
import { credential, findMyVault, signInApp, signInAuth, type AppVault } from "./platform";
import { supersedeOnly, addEntry, listEntries, loadProfile, photoObjectUrl, saveProfile, searchEntries, setProfilePhoto, type Entry, type OwnCard, type SaveResult } from "./data";
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

function Signed({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = useState<View>({ kind: "list" });
  const vault = useQuery({ queryKey: ["vault"], queryFn: () => findMyVault() });
  const vaultId = vault.data?.vaultId;
  return (
    <>
      <header>
        <h1>Records</h1>
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
        {vault.data === null && <p className="error" role="alert">You have no vault you can write to.</p>}
        {vaultId && view.kind === "list" && <RecordList vaultId={vaultId} onOpen={(entry) => setView({ kind: "card", entry })} />}
        {vaultId && view.kind === "card" && <RecordCard entry={view.entry} onBack={() => setView({ kind: "list" })} />}
        {vault.data && view.kind === "profile" && <ProfileView vault={vault.data} />}
      </main>
    </>
  );
}

const SUPERSEDE_NOTICE = "This run changes existing records only. Adding records and pictures is off.";

export function RecordList({ vaultId, onOpen }: { vaultId: string; onOpen: (t: Entry) => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const entries = useQuery({ queryKey: ["entries", vaultId], queryFn: () => listEntries(vaultId) });
  const shown = searchEntries(entries.data ?? [], query);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return; // a second press or Enter while the create is on the wire
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await addEntry(vaultId, name, description);
      setName("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["entries", vaultId] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      {supersedeOnly() ? <p className="muted">{SUPERSEDE_NOTICE}</p> : (
      <form className="card" onSubmit={add} aria-label="Add a record">
        <label htmlFor="rec-name">Name</label>
        <input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="rec-desc">Description</label>
        <textarea id="rec-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
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
      {entries.data && shown.length === 0 && <p className="muted">{query ? "No record matches." : "No records yet. Add the first one above."}</p>}
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

export function Avatar({ vaultId, location, small }: { vaultId: string; location: string; small?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
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
  return src ? <img className={cls} src={src} alt="Profile picture" /> : <div className={cls} role="img" aria-label="No picture" />;
}

export function ProfileView({ vault }: { vault: AppVault }) {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile", vault.vaultId], queryFn: () => loadProfile(vault) });
  if (profile.isLoading) return <p className="muted">Loading profile…</p>;
  if (profile.error) return <p className="error" role="alert">{(profile.error as Error).message}</p>;
  const state = profile.data!;
  return (
    <>
      {state.kind === "card" && state.otherOwnerCards.length > 0 && (
        <p className="error" role="status">Warning: this vault holds more than one card that looks like yours ({state.otherOwnerCards.join(", ")}). Nothing was changed.</p>
      )}
      <ProfileForm
        key={state.kind === "card" ? state.card.id : "none"}
        vaultId={vault.vaultId}
        card={state.kind === "card" ? state.card : null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["profile", vault.vaultId] })}
      />
      <section className="card" aria-label="Connection">
        <h2>Connection</h2>
        <p>Vaults reached: {vault.reachCount ?? "unknown"}</p>
        <p>Vault: {vault.vaultId} ({(vault.modes ?? []).join(", ") || "no modes"})</p>
        <p>Own card road: {state.kind === "card" ? state.card.road : "none"}</p>
        <p>Own card id: {state.kind === "card" ? state.card.id : "none"}</p>
      </section>
    </>
  );
}

function ProfileForm({ vaultId, card, onSaved }: { vaultId: string; card: OwnCard | null; onSaved: () => unknown }) {
  const [f, setF] = useState({ name: card?.name ?? "", email: card?.email ?? "", phone: card?.phone ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const actions = pickContactActions({ phones: [f.phone], emails: [f.email], socials: [] });
  const off = card === null;

  async function run(fn: () => Promise<SaveResult | void>, done: string) {
    setErr(null); setMsg(null);
    try {
      const r = await fn();
      await onSaved();
      if (r && !r.confirmed) setErr(`The vault did not confirm the change: ${r.failed.join(", ")}`);
      else setMsg(done);
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <form className="card" aria-label="Profile" onSubmit={(e) => { e.preventDefault(); if (card) void run(() => saveProfile(card, f), "Profile saved."); }}>
      {off && <p className="error" role="alert">No profile card was found in your vault.</p>}
      <Avatar vaultId={vaultId} location={card?.photo ?? ""} />
      {supersedeOnly() ? <p className="muted">{SUPERSEDE_NOTICE}</p> : (<>
      <label htmlFor="pic">Profile picture</label>
      <input id="pic" type="file" accept="image/*" disabled={off} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void run(() => setProfilePhoto(vaultId, card, file), "Picture saved."); }} />
      </>)}
      <label htmlFor="p-name">Name</label>
      <input id="p-name" disabled={off} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <label htmlFor="p-email">Email{card && card.moreEmails > 0 ? ` (first of ${card.moreEmails + 1}; the others are kept)` : ""}</label>
      <input id="p-email" type="email" disabled={off} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <label htmlFor="p-phone">Phone{card && card.morePhones > 0 ? ` (first of ${card.morePhones + 1}; the others are kept)` : ""}</label>
      <input id="p-phone" type="tel" disabled={off} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      {actions.length > 0 && <p>{actions.map((a) => <a key={a.kind} href={a.href} style={{ marginRight: 12 }}>{a.label}</a>)}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {msg && <p role="status">{msg}</p>}
      <p><button className="primary" type="submit" disabled={off}>Save profile</button></p>
    </form>
  );
}
