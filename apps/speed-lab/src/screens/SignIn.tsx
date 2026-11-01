// Sign-in (stand-in): two people, two buttons.
import { PEOPLE } from "../fakePlatform";

export function SignIn({ busy, onSignIn }: { busy: boolean; onSignIn: (vault: string) => void }) {
  return (
    <section>
      <h1>Speed Lab</h1>
      <p>Sign in as (stand-in):</p>
      <button data-testid="signin-ann" disabled={busy} onClick={() => onSignIn(PEOPLE.ann.vault)}>Ann</button>{" "}
      <button data-testid="signin-ben" disabled={busy} onClick={() => onSignIn(PEOPLE.ben.vault)}>Ben</button>
    </section>
  );
}
