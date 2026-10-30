import { useEffect, useState } from "react";
import { hub } from "@kaigilb/gilbplatformcode-speed-kit";
import { Messages } from "./Messages";
import { Entries } from "./screens/Entries";
import { EntryPage } from "./screens/Entry";
import { Header } from "./screens/Header";
import { SignIn } from "./screens/SignIn";
import { SpeedPanel } from "./screens/SpeedPanel";
import { session } from "./session";
import { signIn, signOut } from "./speed";

type Page = { name: "entries" } | { name: "entry"; id: string };

export function App() {
  const [person, setPerson] = useState<string | null>(null); // the signed-in person's vault, which is also the workspace
  const [page, setPage] = useState<Page>({ name: "entries" });
  const [busy, setBusy] = useState(false);
  // A change of person that did not come through our own buttons (a bare hub.setPrincipal) sends the screens back to sign-in.
  useEffect(() => {
    hub.registerCache("speedkittaking.app", () => setPerson(null));
    return () => hub.registerCache("speedkittaking.app", () => undefined);
  }, []);

  const signInAs = async (vault: string) => {
    setBusy(true);
    try { await signIn(vault); setPage({ name: "entries" }); setPerson(vault); } finally { setBusy(false); }
  };
  const out = () => { setPerson(null); void signOut(); }; // the screens go first; then the memory, the jobs and the copy on the device

  const client = session.client;
  return (
    <div>
      {person === null || client === null ? <SignIn busy={busy} onSignIn={(v) => void signInAs(v)} /> : (
        <>
          <Header ws={person} client={client} onNav={() => setPage({ name: "entries" })} onSignOut={out} />
          <Messages ws={person} />
          {page.name === "entries"
            ? <Entries ws={person} client={client} onOpen={(id) => setPage({ name: "entry", id })} />
            : <EntryPage ws={person} client={client} id={page.id} onBack={() => setPage({ name: "entries" })} />}
        </>
      )}
      <SpeedPanel />
    </div>
  );
}
