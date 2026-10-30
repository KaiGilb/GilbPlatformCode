// Live mode: a real sign-in (email one-time code, DPoP-bound key held in memory only) and a read-only completeCopy of one pinned vault.
// Person = the principal the server gives back after sign-in, never the typed email. Nothing here writes to the vault.
import { useEffect, useMemo, useState } from "react";
import { SignInCard, type SignInApp, type Transport } from "@kaigilb/gilbplatformcode-signin";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { lwsAuthFromSession, resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { platformFetch, type TermFetch } from "@kaigilb/gilbplatformcode-platform-fetch";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { hub, sync } from "@kaigilb/gilbplatformcode-speed-kit";
import { TYPE } from "../catalog";
import { pinnedVault, platformOrigin } from "../mode";
import { session } from "../session";
import { endSession, startSession } from "../speed";
import { Entries } from "../screens/Entries";
import { LiveEntryPage } from "../screens/LiveEntry";
import { Header } from "../screens/Header";
import { SpeedPanel } from "../screens/SpeedPanel";
import { makeAuth, PRODUCT_NAME } from "./auth";
import { isExpired, readReach, type Reach } from "./reach";

export interface LiveSeams {
  /** Makes the credential a sign-in fills. Default: a new `SessionCredential` (key and token in memory only). */
  makeSession?: () => SessionCredential;
  /** The transport of the sign-in's code request. Default: the unit's (`fetch`). */
  transport?: Transport;
  /** The network under the authenticated fetch. Default: `fetch`. */
  inner?: TermFetch;
  vault?: string;
  platform?: string;
}

type Phase =
  | { k: "signin" }
  | { k: "working" }
  | { k: "noProof" }
  | { k: "problem"; text: string }
  | { k: "expired" }
  | { k: "absent"; person: string; reach: Reach; tried: number | null }
  | { k: "ready"; person: string; reach: Reach };
type Page = { name: "entries" } | { name: "entry"; id: string };

export function LiveApp({ makeSession = () => new SessionCredential(), transport, inner, vault = pinnedVault(), platform = platformOrigin() }: LiveSeams) {
  const [credential, setCredential] = useState<SessionCredential>(makeSession);
  const [phase, setPhase] = useState<Phase>({ k: "signin" });
  const [page, setPage] = useState<Page>({ name: "entries" });
  const authed = useMemo(() => platformFetch(inner), [inner]);
  const vaultOrigin = useMemo(() => { try { return new URL(vault).origin; } catch { return ""; } }, [vault]);

  // A change of person that did not come through our own buttons (a bare hub.setPrincipal) sends the screens back to sign-in.
  useEffect(() => {
    hub.registerCache("speedkittaking.liveApp", () => setPhase((p) => (p.k === "working" ? p : { k: "signin" })));
    return () => hub.registerCache("speedkittaking.liveApp", () => undefined);
  }, []);

  const signOut = () => {
    credential.invalidate(true); // the key and the token go
    setCredential(makeSession());
    setPhase({ k: "signin" });
    setPage({ name: "entries" });
    resetLwsAuth();
    resetBaseOrigin();
    void endSession();
  };

  const afterSignIn = async () => {
    setPhase({ k: "working" });
    setBaseOrigin(platform);
    setLwsAuth(lwsAuthFromSession(credential));
    const principal = credential.session?.principal; // the server's answer to verify-code, not the typed email
    if (!principal) { setPhase({ k: "noProof" }); return; }
    await startSession(principal, vault, { origin: vaultOrigin, fetch: authed }); // hub person = the principal; nothing is read from the vault yet
    let reach: Reach;
    try { reach = await readReach(authed, platform); } catch (e) {
      setPhase(isExpired(e) ? { k: "expired" } : { k: "problem", text: `Could not read which vaults you reach (${e instanceof Error ? e.message : "unknown error"}).` });
      return;
    }
    if (reach.vaults.length === 0) { setPhase({ k: "noProof" }); return; } // an empty reach while signed in proves nothing
    setPhase(reach.vaults.some((v) => v.vaultId === vault) ? { k: "ready", person: principal, reach } : { k: "absent", person: principal, reach, tried: null });
  };

  // ONE read of the pinned vault, reporting its status.
  const tryAnyway = async (p: Extract<Phase, { k: "absent" }>) => {
    const url = sync.routeUrl({ origin: vaultOrigin, fetch: authed }, `lws/vault/${sync.vaultSegment(vault)}/records?type=${encodeURIComponent(TYPE.replace(/^t:/, ""))}`);
    try {
      const res = await authed(url);
      setPhase(res.status === 401 ? { k: "expired" } : { ...p, tried: res.status });
    } catch (e) { setPhase(isExpired(e) ? { k: "expired" } : { k: "problem", text: `The read did not go through (${e instanceof Error ? e.message : "unknown error"}).` }); }
  };

  const app = useMemo<SignInApp>(() => ({ id: "speedkittakinglive", productName: PRODUCT_NAME, title: "Sign in", origin: platform, returnTo: () => window.location.href }), [platform]);
  const auth = useMemo(() => makeAuth(credential, platform, transport), [credential, platform, transport]);

  let body;
  if (phase.k === "signin" || phase.k === "noProof" || phase.k === "problem" || phase.k === "expired") {
    body = (
      <section>
        <h1>Speed kit taking app (live check)</h1>
        <p>Reads the catalogue entries of one vault: {vault}</p>
        <p>On this local check a reload signs you out; sign in again with a new code.</p>
        {phase.k === "expired" && <p role="alert" data-testid="expired">Your sign-in has run out; sign in again.</p>}
        {phase.k === "noProof" && <p role="alert" data-testid="no-proof">Sign-in did not prove who you are</p>}
        {phase.k === "problem" && <p role="alert" data-testid="problem">{phase.text}</p>}
        <SignInCard app={app} auth={auth} onSignedIn={() => void afterSignIn()} />
      </section>
    );
  } else if (phase.k === "working") {
    body = <p>Signing in...</p>;
  } else if (phase.k === "absent") {
    body = (
      <section>
        <p role="alert" data-testid="vault-absent">The vault {vault} is not among the {phase.reach.vaults.length} vault(s) your sign-in reaches. Nothing is loaded.</p>
        {!phase.reach.complete && (
          <>
            <p data-testid="reach-incomplete">The list may be short: {phase.reach.incompletePeers} store(s) did not answer (complete: false), so the vault may still be readable.</p>
            <button data-testid="try-anyway" onClick={() => void tryAnyway(phase)}>Try reading it anyway</button>
            {phase.tried !== null && <p data-testid="tried">The vault answered {phase.tried}.</p>}
            {phase.tried === 200 && <button data-testid="load-anyway" onClick={() => setPhase({ k: "ready", person: phase.person, reach: phase.reach })}>Load the list</button>}
          </>
        )}
        <button data-testid="signout" onClick={signOut}>Sign out</button>
      </section>
    );
  } else {
    const client = session.client;
    body = client === null ? <p>Signing in...</p> : (
      <>
        <Header ws={vault} label={phase.person} client={client} onNav={() => setPage({ name: "entries" })} onSignOut={signOut} />
        <aside data-testid="reach">Reach: {phase.reach.vaults.length} vault(s); complete: {String(phase.reach.complete)}; incompletePeers: {phase.reach.incompletePeers}</aside>
        {page.name === "entries"
          ? <Entries ws={vault} client={client} onOpen={(id) => setPage({ name: "entry", id })} expired={isExpired} onSignInAgain={signOut} />
          : <LiveEntryPage ws={vault} client={client} id={page.id} onBack={() => setPage({ name: "entries" })} />}
      </>
    );
  }
  return <div>{body}<SpeedPanel /></div>;
}
