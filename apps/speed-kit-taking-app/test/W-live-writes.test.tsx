import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { dumpDevice } from "./helpers";
import { bootLive, fakeCredential, liveApp, signInLive } from "./liveHelpers";
import { OTHER_PRINCIPAL, PRINCIPAL, VAULT, VAULT_ORIGIN } from "./liveFixtures";
import { fakeVault, type VaultOptions } from "./liveVault";

const madeKey = `speedkittaking-live.made.${PRINCIPAL}.${VAULT}`;
const NAMED = /^speedkit-proof [0-9a-z]+ \d+$/;

async function signedIn(opts: VaultOptions = {}, allowWrite = true) {
  const k = await bootLive();
  const vault = fakeVault(opts);
  const app = await liveApp(k, vault, undefined, { allowWrite });
  await signInLive(app.user);
  await screen.findByTestId("entry-k1");
  return { k, vault, ...app };
}
const toastText = () => screen.getByTestId("toast").textContent ?? "";
const noticeText = () => screen.getByTestId("notice").textContent ?? "";

describe("W live writes", () => {
  test("W1 gate: without --allow-write none of the three buttons exists and nothing but GET is sent", async () => {
    const { vault, user } = await signedIn({}, false);
    expect(screen.queryByTestId("seed-button")).toBeNull();
    expect(screen.queryByTestId("end-button")).toBeNull();
    expect(screen.queryByTestId("live-tools")).toBeNull();
    await user.click(screen.getByTestId("nav-entry-k3"));
    expect(screen.getByTestId("rename-absent").textContent).toBe("Rename is not in this build");
    expect(screen.queryByTestId("rename-input")).toBeNull();
    expect(vault.writes()).toEqual([]);
    expect(vault.calls.every((c) => c.method === "GET")).toBe(true);
  });

  test("W2 origin: a write to any origin other than the pinned vault's is refused before fetch, and so is a write when writes are off", async () => {
    const k = await bootLive();
    const { createWriter, WriteRefused } = await import("../src/live/writes");
    void k;
    const seen: string[] = [];
    const spy = (async (url: string) => { seen.push(url); return new Response("{}", { status: 200 }); }) as never;
    const on = createWriter({ fetch: spy, vault: VAULT, allow: true });
    for (const url of ["https://elsewhere.example.test/lws/r/x", "https://id.platform.example.test/lws/r/x", `${VAULT_ORIGIN}.evil.example.test/lws/r/x`, "https://ann.platform.example.test:8443/lws/r/x", "http://ann.platform.example.test/lws/r/x", "not a url"]) {
      for (const method of ["PATCH", "POST", "DELETE", "GET"]) await expect(on.send(method, url), `${method} ${url}`).rejects.toBeInstanceOf(WriteRefused);
    }
    expect(seen).toEqual([]);
    await on.send("PATCH", `${VAULT_ORIGIN}/lws/r/x`); // the pinned origin passes
    expect(seen).toEqual([`${VAULT_ORIGIN}/lws/r/x`]);
    const off = createWriter({ fetch: spy, vault: VAULT, allow: false });
    await expect(off.send("DELETE", `${VAULT_ORIGIN}/lws/r/x`)).rejects.toBeInstanceOf(WriteRefused);
    await off.send("GET", `${VAULT_ORIGIN}/lws/r/x`); // a read is not a write
    expect(seen).toHaveLength(2);
  });

  test("W3 rename: If-Match and the write key are sent, 'Renamed.' needs the read-back, a 412 gives the notice and no second PATCH, recheck refuses a changed name", async () => {
    // success
    let t = await signedIn();
    await t.user.click(screen.getByTestId("nav-entry-k3"));
    fireEvent.change(screen.getByTestId("rename-input"), { target: { value: "Test it, renamed" } });
    await t.user.click(screen.getByTestId("rename-button"));
    await screen.findByTestId("toast");
    expect(toastText()).toContain("Renamed.");
    const order = t.vault.calls.filter((c) => /\/lws\/r\/k3$/.test(c.url)).map((c) => c.method);
    expect(order).toEqual(["GET", "PATCH", "GET"]); // fresh read, patch, read-back
    const patch = t.vault.calls.find((c) => c.method === "PATCH")!;
    expect(patch.headers.get("if-match")).toBe('"v1"');
    expect(patch.headers.get("content-type")).toBe("application/merge-patch+json");
    expect(JSON.parse(patch.body!)).toEqual({ "a:name": "Test it, renamed" }); // the WRITE key
    expect(t.vault.rows.get("k3")!.name).toBe("Test it, renamed");
    await waitFor(() => expect(screen.getByTestId("entry-name").textContent).toBe("Test it, renamed"));
    t.unmount();

    // a 412: the version moved after the fresh read
    t = await signedIn({ versionMovesAfterRead: true });
    await t.user.click(screen.getByTestId("nav-entry-k3"));
    fireEvent.change(screen.getByTestId("rename-input"), { target: { value: "Never" } });
    await t.user.click(screen.getByTestId("rename-button"));
    await screen.findByTestId("notice");
    expect(noticeText()).toContain("Someone changed it; look again");
    await new Promise((r) => setTimeout(r, 50));
    expect(t.vault.calls.filter((c) => c.method === "PATCH")).toHaveLength(1); // no retry
    expect(t.vault.rows.get("k3")!.name).toBe("Test it");
    expect(screen.queryByTestId("toast")).toBeNull();
    t.unmount();

    // recheck: the name changed after the edit began
    t = await signedIn();
    await t.user.click(screen.getByTestId("nav-entry-k3"));
    fireEvent.change(screen.getByTestId("rename-input"), { target: { value: "Mine" } });
    t.vault.rows.get("k3")!.name = "Changed elsewhere";
    await t.user.click(screen.getByTestId("rename-button"));
    await screen.findByTestId("notice");
    expect(noticeText()).toContain("the name changed since you started editing");
    expect(t.vault.calls.filter((c) => c.method === "PATCH")).toEqual([]);
    t.unmount();

    // accepted but not stored: no "Renamed."
    t = await signedIn({ ignorePatch: true });
    await t.user.click(screen.getByTestId("nav-entry-k3"));
    fireEvent.change(screen.getByTestId("rename-input"), { target: { value: "Lost" } });
    await t.user.click(screen.getByTestId("rename-button"));
    await screen.findByTestId("notice");
    expect(noticeText()).toContain("reads the name back as");
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  test("W4 seed: 50 entries, never more than 4 in flight, a distinct stable Idempotency-Key each, ids stored, 'Added 50 of 50'", async () => {
    const t = await signedIn();
    fireEvent.change(screen.getByTestId("seed-count"), { target: { value: "50" } });
    await t.user.click(screen.getByTestId("seed-button"));
    await waitFor(() => expect(screen.getByTestId("toast").textContent).toContain("Added 50 of 50"), { timeout: 5000 });
    expect(screen.getByTestId("seed-progress").textContent).toContain("Added 50 of 50");
    const runId = /Run id: ([0-9a-z]+)\./.exec(screen.getByTestId("seed-run").textContent ?? "")![1]!;
    expect(t.vault.stats.peak).toBeLessThanOrEqual(4);
    expect(t.vault.stats.peak).toBeGreaterThan(1);
    const creates = t.vault.calls.filter((c) => c.method === "POST");
    expect(creates).toHaveLength(50);
    const keys = creates.map((c) => c.headers.get("idempotency-key")!);
    expect(new Set(keys).size).toBe(50);
    expect(keys.every((x) => x.startsWith(`speedkit-proof.${runId}.`))).toBe(true);
    for (const c of creates) {
      const b = JSON.parse(c.body!) as { type: string; facts: Record<string, string> };
      expect(b.type).toBe("t:CatalogEntry");
      expect(Object.keys(b.facts).sort()).toEqual(["a:description", "a:name"]); // the WRITE keys
      expect(b.facts["a:name"]).toMatch(NAMED);
      expect(b.facts["a:description"]).toBe("Test entry made by speed-kit-taking-app; safe to end.");
    }
    const stored = JSON.parse(localStorage.getItem(madeKey)!) as string[];
    expect(stored).toHaveLength(50);
    expect(new Set(stored)).toEqual(new Set(t.vault.live().filter((r) => NAMED.test(r.name)).map((r) => r.id)));
    expect(t.vault.live()).toHaveLength(53);
    expect(screen.getAllByTestId(/^entry-/)).toHaveLength(53);

    // the same job again (same run id): the same keys, so the vault creates nothing new
    const wj = await import("../src/live/writeJobs");
    const { createWriter } = await import("../src/live/writes");
    const deps = { writer: createWriter({ fetch: t.vault.inner, vault: VAULT, allow: true }), client: t.k.session.client!, principal: PRINCIPAL, vault: VAULT };
    const before = t.vault.stats.newCreates;
    wj.enqueueSeed(deps, 50, runId);
    await waitFor(() => expect(t.vault.stats.replays).toBe(50), { timeout: 5000 });
    await t.k.speed.jobs.jobsIdle();
    expect(t.vault.stats.newCreates).toBe(before);
    expect(t.vault.live()).toHaveLength(53);
    expect(JSON.parse(localStorage.getItem(madeKey)!)).toHaveLength(50);
  });

  test("W4 seed: a failure at #7 stops the job and the notice says how many were made", async () => {
    const t = await signedIn({ failCreatesFrom: 7 });
    await t.user.click(screen.getByTestId("seed-button")); // 10
    await screen.findByTestId("notice", undefined, { timeout: 5000 });
    expect(noticeText()).toContain("6 made of 10");
    expect(noticeText()).toContain("the vault is busy");
    expect(t.vault.stats.createAttempts).toBe(7); // nothing was started after the failure
    expect(JSON.parse(localStorage.getItem(madeKey)!)).toHaveLength(6); // End still knows the six
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  test("W5 end: only listed ids whose fresh name has the prefix are ended; others stay; ended ids leave the list", async () => {
    const k = await bootLive();
    const vault = fakeVault();
    for (let i = 1; i <= 8; i++) vault.add(`p${i}`, `speedkit-proof zz ${i}`, "Test entry made by speed-kit-taking-app; safe to end.");
    vault.add("p9", "Renamed away from the prefix", "x"); // on the list, but renamed
    vault.add("p10", "speedkit-proof zz 10", "x"); // has the prefix, but this app did not make it (not on the list)
    localStorage.setItem(madeKey, JSON.stringify(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]));
    const app = await liveApp(k, vault, undefined, { allowWrite: true });
    await signInLive(app.user);
    await screen.findByTestId("entry-k1");
    await app.user.click(screen.getByTestId("end-button"));
    await waitFor(() => expect(screen.getByTestId("toast").textContent).toContain("Ended 8 test entries"), { timeout: 5000 });
    expect(screen.getByTestId("toast").textContent).toContain("1 left alone");
    for (let i = 1; i <= 8; i++) expect(vault.rows.get(`p${i}`)!.ended, `p${i}`).toBe(true);
    for (const id of ["p9", "p10", "k1", "k2", "k3"]) expect(vault.rows.get(id)!.ended, id).toBe(false); // untouched
    const deletes = vault.calls.filter((c) => c.method === "DELETE");
    expect(deletes).toHaveLength(8);
    for (const d of deletes) { expect(d.url).toMatch(/^https:\/\/ann\.platform\.example\.test\/lws\/r\/p[1-8]$/); expect(d.headers.get("if-match")).toMatch(/^"v\d+"$/); }
    expect(vault.calls.every((c) => !/\/lws\/vault\/[^/]+$/.test(c.url))).toBe(true); // never a vault-level route
    expect(JSON.parse(localStorage.getItem(madeKey)!)).toEqual(["p9"]);
    await waitFor(() => expect(screen.queryByTestId("entry-p1")).toBeNull());
    expect(screen.getByTestId("entry-p9")).toBeTruthy();
    expect(screen.getByTestId("entry-p10")).toBeTruthy();
    expect(screen.getByTestId("entry-k1")).toBeTruthy();
  });

  test("W6 per person: sign-out wipes the device copy, and the made-list is per principal and vault, so another principal sees and ends nothing of it", async () => {
    const t = await signedIn();
    await t.user.click(screen.getByTestId("seed-button")); // 10
    await waitFor(() => expect(screen.getByTestId("toast").textContent).toContain("Added 10 of 10"), { timeout: 5000 });
    await t.k.speed.currentPersist()!.flush();
    expect(await dumpDevice("speedkittaking-live-cache")).toContain("base/p/ann");
    await t.user.click(screen.getByTestId("signout"));
    await screen.findByTestId("sign-in-email");
    await waitFor(async () => expect(await dumpDevice("speedkittaking-live-cache")).not.toContain("base/p/ann"));
    expect(JSON.parse(localStorage.getItem(madeKey)!)).toHaveLength(10); // kept for this principal and vault
    expect(Object.keys(localStorage).concat(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!)).filter((x) => x.includes("made.")).every((x) => x.includes(PRINCIPAL))).toBe(true);

    const { readMade } = await import("../src/live/made");
    const wj = await import("../src/live/writeJobs");
    const { createWriter } = await import("../src/live/writes");
    expect(readMade(OTHER_PRINCIPAL, VAULT)).toEqual([]);
    expect(readMade(PRINCIPAL, "https://zoe.platform.example.test/vault")).toEqual([]);
    const deps = { writer: createWriter({ fetch: t.vault.inner, vault: VAULT, allow: true }), client: t.k.session.client ?? ({} as never), principal: OTHER_PRINCIPAL, vault: VAULT };
    const before = t.vault.calls.length;
    await act(async () => { wj.enqueueEnd(deps); await t.k.speed.jobs.jobsIdle(); });
    expect(t.vault.calls.slice(before).filter((c) => c.method === "DELETE")).toEqual([]);
    expect(t.vault.live()).toHaveLength(13); // 3 + 10: nothing of Ann's was ended by Bob
  });
  test("W7 ended: an ended record is a 200 marked ended (not a 404); it counts as ended for End, a rename of it is refused with no PATCH, and a 404 also counts as ended", async () => {
    const PREFIXED = "speedkit-proof zz";
    // (a) the real shape: ended = 200 with the lifecycle mark and no name
    let k = await bootLive();
    let vault = fakeVault();
    vault.add("p1", `${PREFIXED} 1`, "x"); vault.add("p2", `${PREFIXED} 2`, "x");
    vault.rows.get("p2")!.ended = true; // already ended by someone
    localStorage.setItem(madeKey, JSON.stringify(["p1", "p2"]));
    let app = await liveApp(k, vault, undefined, { allowWrite: true });
    await signInLive(app.user);
    await screen.findByTestId("entry-k1");
    const probe = await (vault.inner as unknown as (u: string, i?: RequestInit) => Promise<Response>)(`${VAULT_ORIGIN}/lws/r/p2`, { method: "GET" });
    expect(probe.status).toBe(200); // not a 404
    expect(await probe.json()).toMatchObject({ "a:entityLifecycleState": "ended", "a:endingActorKind": "holder" });
    await app.user.click(screen.getByTestId("end-button"));
    await waitFor(() => expect(screen.getByTestId("toast").textContent).toContain("Ended 1 test entries"), { timeout: 5000 });
    expect(screen.getByTestId("toast").textContent).toContain("1 were already ended");
    expect(vault.calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([`${VAULT_ORIGIN}/lws/r/p1`]); // none sent for the one already ended
    expect(JSON.parse(localStorage.getItem(madeKey)!)).toEqual([]);
    app.unmount();
    localStorage.clear();

    // (b) a rename of a record that has been ended is refused, and nothing is written
    k = await bootLive();
    vault = fakeVault();
    app = await liveApp(k, vault, undefined, { allowWrite: true });
    await signInLive(app.user);
    await screen.findByTestId("entry-k1");
    await app.user.click(screen.getByTestId("nav-entry-k3"));
    fireEvent.change(screen.getByTestId("rename-input"), { target: { value: "Too late" } });
    vault.rows.get("k3")!.ended = true; // ended elsewhere after the page showed it
    await app.user.click(screen.getByTestId("rename-button"));
    await screen.findByTestId("notice");
    expect(noticeText()).toContain("This entry has been ended");
    expect(vault.writes()).toEqual([]);
    expect(screen.queryByTestId("toast")).toBeNull();
    app.unmount();
    localStorage.clear();

    // (c) a platform that answers 404 for an ended record: that counts as ended too
    k = await bootLive();
    vault = fakeVault({ endedAs: "404" });
    vault.add("p1", `${PREFIXED} 1`, "x"); vault.add("p2", `${PREFIXED} 2`, "x");
    localStorage.setItem(madeKey, JSON.stringify(["p1", "p2"]));
    app = await liveApp(k, vault, undefined, { allowWrite: true });
    await signInLive(app.user);
    await screen.findByTestId("entry-k1");
    await app.user.click(screen.getByTestId("end-button"));
    await waitFor(() => expect(screen.getByTestId("toast").textContent).toContain("Ended 2 test entries"), { timeout: 5000 });
    expect(JSON.parse(localStorage.getItem(madeKey)!)).toEqual([]);
  });
});
