import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SignInCard } from "@kaigilb/gilbplatformcode-signin";
import { pickContactActions } from "@kaigilb/gilbplatformcode-contact-actions";
import type { ColorSchemePreference } from "@kaigilb/gilbplatformcode-color-scheme";
import { credential, findMyVault, signInApp, signInAuth } from "./platform";
import { addThing, listThings, loadProfile, photoObjectUrl, saveProfile, searchThings, setProfilePhoto, type Profile, type Thing } from "./data";
import { loadPreference, nextPreference, setPreference } from "./theme";

type View = { kind: "list" } | { kind: "card"; thing: Thing } | { kind: "profile" };

export function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // A sign-in kept by the session bridge survives a reload; no bridge session means the card.
    credential.getSession().then(() => setSignedIn(true), () => undefined).finally(() => setChecked(true));
  }, []);

  if (!checked) return <p className="muted" style={{ padding: 16 }}>Loading…</p>;
  if (!signedIn) {
    return (
      <div className="signin card">
        <SignInCard app={signInApp} auth={signInAuth} onSignedIn={() => setSignedIn(true)} />
      </div>
    );
  }
  return <Signed onSignOut={() => { credential.invalidate(true); setSignedIn(false); }} />;
}

function ThemeToggle() {
  const [pref, setPref] = useState<ColorSchemePreference>(loadPreference());
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
  const vault = useQuery({ queryKey: ["vault"], queryFn: findMyVault });
  const vaultId = vault.data?.vaultId;
  return (
    <>
      <header>
        <h1>Records</h1>
        <button onClick={() => setView({ kind: "list" })}>Records</button>
        <button onClick={() => setView({ kind: "profile" })}>Profile</button>
        <ThemeToggle />
        <button onClick={onSignOut}>Sign out</button>
      </header>
      <main>
        {vault.isLoading && <p className="muted">Finding your vault…</p>}
        {vault.error && <p className="error" role="alert">{(vault.error as Error).message}</p>}
        {vault.data === null && <p className="error" role="alert">You have no vault you can write to.</p>}
        {vaultId && view.kind === "list" && <RecordList vaultId={vaultId} onOpen={(thing) => setView({ kind: "card", thing })} />}
        {vaultId && view.kind === "card" && <RecordCard thing={view.thing} onBack={() => setView({ kind: "list" })} />}
        {vaultId && view.kind === "profile" && <ProfileView vaultId={vaultId} />}
      </main>
    </>
  );
}

export function RecordList({ vaultId, onOpen }: { vaultId: string; onOpen: (t: Thing) => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const things = useQuery({ queryKey: ["things", vaultId], queryFn: () => listThings(vaultId) });
  const shown = searchThings(things.data ?? [], query);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addThing(vaultId, name, description);
      setName("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["things", vaultId] });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <form className="card" onSubmit={add} aria-label="Add a record">
        <label htmlFor="rec-name">Name</label>
        <input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="rec-desc">Description</label>
        <textarea id="rec-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <p><button className="primary" type="submit">Add record</button></p>
      </form>
      <label htmlFor="rec-search">Search records</label>
      <input id="rec-search" type="search" placeholder="Search name or description" value={query} onChange={(e) => setQuery(e.target.value)} />
      {things.isLoading && <p className="muted">Loading records…</p>}
      {things.error && <p className="error" role="alert">{(things.error as Error).message}</p>}
      <div className="list" aria-label="Records">
        {shown.map((t) => (
          <button key={t.id} className="card row" onClick={() => onOpen(t)}>
            <strong>{t.name}</strong>
            <span>{t.description}</span>
          </button>
        ))}
        {things.data && shown.length === 0 && <p className="muted">{query ? "No record matches." : "No records yet. Add the first one above."}</p>}
      </div>
    </>
  );
}

export function RecordCard({ thing, onBack }: { thing: Thing; onBack: () => void }) {
  return (
    <article className="card" aria-label="Record">
      <button onClick={onBack}>Back to records</button>
      <h2>{thing.name}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{thing.description || <span className="muted">No description.</span>}</p>
    </article>
  );
}

function Avatar({ vaultId, location, small }: { vaultId: string; location: string; small?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    photoObjectUrl(vaultId, location).then((u) => live && setSrc(u), () => undefined);
    return () => { live = false; };
  }, [vaultId, location]);
  return src ? <img className={small ? "avatar sm" : "avatar"} src={src} alt="Profile picture" /> : <div className={small ? "avatar sm" : "avatar"} aria-label="No picture" />;
}

export function ProfileView({ vaultId }: { vaultId: string }) {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile", vaultId], queryFn: () => loadProfile(vaultId) });
  return profile.isLoading ? <p className="muted">Loading profile…</p> : <ProfileForm key={profile.data?.id ?? "new"} vaultId={vaultId} current={profile.data ?? null} onSaved={() => qc.invalidateQueries({ queryKey: ["profile", vaultId] })} />;
}

function ProfileForm({ vaultId, current, onSaved }: { vaultId: string; current: Profile | null; onSaved: () => unknown }) {
  const [f, setF] = useState({ name: current?.name ?? "", email: current?.email ?? "", phone: current?.phone ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const actions = pickContactActions({ phones: [f.phone], emails: [f.email], socials: [] });

  async function run(fn: () => Promise<void>, done: string) {
    setErr(null); setMsg(null);
    try { await fn(); await onSaved(); setMsg(done); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <form className="card" aria-label="Profile" onSubmit={(e) => { e.preventDefault(); void run(() => saveProfile(vaultId, current, f), "Profile saved."); }}>
      <Avatar vaultId={vaultId} location={current?.photo ?? ""} />
      <label htmlFor="pic">Profile picture</label>
      <input id="pic" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void run(() => setProfilePhoto(vaultId, current, file), "Picture saved."); }} />
      <label htmlFor="p-name">Name</label>
      <input id="p-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <label htmlFor="p-email">Email</label>
      <input id="p-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <label htmlFor="p-phone">Phone</label>
      <input id="p-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      {actions.length > 0 && <p>{actions.map((a) => <a key={a.kind} href={a.href} style={{ marginRight: 12 }}>{a.label}</a>)}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {msg && <p role="status">{msg}</p>}
      <p><button className="primary" type="submit">Save profile</button></p>
    </form>
  );
}
