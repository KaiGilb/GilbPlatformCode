// Ported from GilbApp's contactAnnotation.s10labels.test.ts (9 tests): the notes read is TIED to the vault the card is held in. A holder who manages more
// than one vault gets the route's own pick (the child's) with empty notes; the PUT names the vault, so reading from the wrong one lets the next keystroke
// overwrite the stored note. The platform is stubbed as measured on the rig: the GET cannot name a vault today; it answers from the vault it picks and says
// which (`vault`). Re-based on the real peers over a recording credential; the hosts are `example.test` hosts under the base origin.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationVaultMismatchError, ANNOTATIONS_VAULT_PARAM, loadHolderAnnotations, sameVault } from "./index";
import { setUp, tearDown } from "../test/support";

const A = "https://holder.platform.example.test/vault"; // the holder's own vault (where the note is)
const B = "https://kid.platform.example.test/vault"; // a child vault of the holder: the platform's own pick
const PARTY = `${A}/e/rita`;
const notesIn: Record<string, string> = { [A]: "secret-note-word: met at the Oslo summit", [B]: "" };

/** The platform: `pick` answers when no vault is named; `takesParam` = the platform's optional vault parameter exists. */
function platform(opts: { pick: string; takesParam: boolean; echo?: boolean }) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.search);
    const named = url.searchParams.get(ANNOTATIONS_VAULT_PARAM);
    if (named !== null && !opts.takesParam) return new Response(JSON.stringify({ error: "BadRequest", message: "querystring must NOT have additional properties" }), { status: 400 });
    const vault = named ?? opts.pick;
    const text = notesIn[vault] ?? "";
    return Response.json({
      me: "p",
      heldParty: url.searchParams.get("heldParty"),
      note: text || null,
      origin: null,
      notes: text ? [{ entity: `${vault}/e/n1`, text }] : [],
      origins: [],
      noteLoad: text ? "ok" : "empty",
      originLoad: "empty",
      ...(opts.echo === false ? {} : { vault }),
    });
  });
  vi.stubGlobal("fetch", fetchImpl);
  return { calls, fetchImpl };
}

beforeEach(setUp);
afterEach(tearDown);

describe("the notes read is tied to the card's vault", () => {
  it("a holder with ONE vault: the platform's pick is the card's vault, one request, the note comes back", async () => {
    const p = platform({ pick: A, takesParam: false });
    const got = await loadHolderAnnotations(PARTY, A);
    expect(got.note).toBe("secret-note-word: met at the Oslo summit");
    expect(p.calls.length).toBe(1);
    expect(p.calls[0]).not.toContain(ANNOTATIONS_VAULT_PARAM); // an old platform would refuse it: it is asked only when it must be
  });

  it("two vaults, a platform that predates the parameter: the read from the child is REFUSED, never shown as an empty note (RED at f51ca61: it was returned as empty)", async () => {
    platform({ pick: B, takesParam: false });
    await expect(loadHolderAnnotations(PARTY, A)).rejects.toBeInstanceOf(AnnotationVaultMismatchError);
  });

  it("the refusal is remembered: the next read of the same kind makes ONE request, not two", async () => {
    const p = platform({ pick: B, takesParam: false });
    await expect(loadHolderAnnotations(PARTY, A)).rejects.toThrow();
    const n = p.calls.length;
    await expect(loadHolderAnnotations(PARTY, A)).rejects.toThrow();
    expect(p.calls.length).toBe(n + 1);
  });

  it("two vaults, a platform that takes the parameter: the card in A reads A's note (found by asking again, naming the vault) and then names it at once", async () => {
    const p = platform({ pick: B, takesParam: true });
    const got = await loadHolderAnnotations(PARTY, A);
    expect(got.note).toBe("secret-note-word: met at the Oslo summit");
    expect(got.vault).toBe(A);
    expect(p.calls.length).toBe(2);
    await loadHolderAnnotations(PARTY, A);
    expect(p.calls.length).toBe(3);
    expect(p.calls[2]).toContain(`${ANNOTATIONS_VAULT_PARAM}=`);
  });

  it("the card in B reads B's own notes, never A's", async () => {
    platform({ pick: B, takesParam: true });
    const got = await loadHolderAnnotations(`${B}/e/walker`, B);
    expect(got.note).toBeNull();
    expect(got.vault).toBe(B);
  });

  it("a platform that does not say which vault answered cannot be tied: refused", async () => {
    platform({ pick: A, takesParam: false, echo: false });
    await expect(loadHolderAnnotations(PARTY, A)).rejects.toBeInstanceOf(AnnotationVaultMismatchError);
  });

  it("a platform that takes the parameter but answers from another vault anyway is refused (the echo is the proof, not the request)", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json({ me: "p", heldParty: PARTY, notes: [], origins: [], noteLoad: "empty", originLoad: "empty", vault: B });
    });
    await expect(loadHolderAnnotations(PARTY, A)).rejects.toBeInstanceOf(AnnotationVaultMismatchError);
  });

  it("once the platform is known to take the parameter the echo is STILL the proof: a later answer from another vault is refused", async () => {
    platform({ pick: B, takesParam: true });
    await loadHolderAnnotations(PARTY, A); // learns `yes`
    vi.stubGlobal("fetch", async () => Response.json({ me: "p", heldParty: PARTY, notes: [], origins: [], noteLoad: "empty", originLoad: "empty", vault: B }));
    await expect(loadHolderAnnotations(PARTY, A)).rejects.toBeInstanceOf(AnnotationVaultMismatchError);
  });

  it("a vault is its host (the held-claim reads compare them so): `/vault` and `/base` spellings of one host are one vault", () => {
    expect(sameVault("https://holder.platform.example.test/base", A)).toBe(true);
    expect(sameVault("https://kid.platform.example.test/vault", A)).toBe(false);
    expect(sameVault(null, A)).toBe(false);
  });
});
