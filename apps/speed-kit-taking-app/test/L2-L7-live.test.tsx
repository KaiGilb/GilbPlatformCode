import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { dumpDevice } from "./helpers";
import { bootLive, fakeCredential, fakeNet, liveApp, signInLive } from "./liveHelpers";
import { EMAIL, OTHER_VAULT, PLATFORM, PRINCIPAL, VAULT, VAULT_ORIGIN, reachBody, vaultNode } from "./liveFixtures";

describe("live mode", () => {
  test("L2 person: after a sign-in that returns a principal, the hub person is that principal, not the typed email", async () => {
    const k = await bootLive();
    const { user } = await liveApp(k);
    await signInLive(user, EMAIL);
    await screen.findByTestId("entry-e1");
    expect(k.hub.currentPrincipal()).toBe(PRINCIPAL);
    expect(String(k.hub.currentPrincipal())).not.toContain(EMAIL);
    expect(String(k.hub.currentPrincipal())).not.toContain("typed.person");
    expect(screen.getByTestId("who").textContent).toContain(PRINCIPAL);
  });

  test("L3 empty reach: 'Sign-in did not prove who you are', and no records request is sent", async () => {
    const k = await bootLive();
    const net = fakeNet({ reach: reachBody([]) });
    const { user } = await liveApp(k, net);
    await signInLive(user);
    await screen.findByTestId("no-proof");
    expect(screen.getByTestId("no-proof").textContent).toBe("Sign-in did not prove who you are");
    expect(net.records()).toEqual([]);
    expect(net.urls.some((u) => u.endsWith("/lws/vaults"))).toBe(true); // it did ask who is reached
  });

  test("L4 pinned vault absent and complete: true: nothing is loaded and the message is shown, with no way to read it anyway", async () => {
    const k = await bootLive();
    const net = fakeNet({ reach: reachBody([vaultNode(OTHER_VAULT, "zoe")], true, 0) });
    const { user } = await liveApp(k, net);
    await signInLive(user);
    await screen.findByTestId("vault-absent");
    expect(screen.getByTestId("vault-absent").textContent).toContain(VAULT);
    expect(screen.queryByTestId("try-anyway")).toBeNull();
    expect(screen.queryByTestId("entry-e1")).toBeNull();
    expect(net.records()).toEqual([]);
  });

  test("L4 pinned vault absent and complete: false: both facts are shown, and 'Try reading it anyway' sends exactly one records request", async () => {
    const k = await bootLive();
    const net = fakeNet({ reach: reachBody([vaultNode(OTHER_VAULT, "zoe")], false, 1) });
    const { user } = await liveApp(k, net);
    await signInLive(user);
    await screen.findByTestId("vault-absent");
    expect(screen.getByTestId("reach-incomplete").textContent).toContain("complete: false");
    expect(net.records()).toEqual([]);
    await user.click(screen.getByTestId("try-anyway"));
    await screen.findByTestId("tried");
    expect(screen.getByTestId("tried").textContent).toBe("The vault answered 200.");
    expect(net.records()).toHaveLength(1);
    expect(screen.queryByTestId("entry-e1")).toBeNull();
  });

  test("L5 expiry: a 401 on the records read after sign-in shows the expiry message, not the sign-in screen", async () => {
    const k = await bootLive();
    const net = fakeNet({ recordsStatus: 401 });
    const { user } = await liveApp(k, net);
    await signInLive(user);
    await screen.findByTestId("expired");
    expect(screen.getByTestId("expired").textContent).toContain("Your sign-in has run out; sign in again.");
    expect(screen.queryByTestId("sign-in-email")).toBeNull();
    expect(screen.queryByTestId("no-proof")).toBeNull();
    expect(screen.getByTestId("signout")).toBeTruthy(); // still the signed-in screens, with their own way out
  });

  test("L6 list and sign-out: a list read with the real shape shows rows; after sign-out the live database holds nothing of that principal", async () => {
    const k = await bootLive();
    const { user } = await liveApp(k);
    await signInLive(user);
    await screen.findByTestId("entry-e1");
    expect(screen.getAllByTestId(/^entry-e\d+$/)).toHaveLength(3);
    expect(screen.getByTestId("entry-e1").textContent).toContain("Entry 1");
    expect(screen.getByTestId("reach").textContent).toContain("complete: true");
    await k.speed.currentPersist()!.flush();
    expect(await dumpDevice("speedkittaking-live-cache")).toContain("base/p/ann"); // it is on the device (so the check below means something)
    expect(await dumpDevice("speedkittaking-cache")).toBe(""); // and no stand-in database was made

    await user.click(screen.getByTestId("signout"));
    await screen.findByTestId("sign-in-email");
    await waitFor(async () => expect(await dumpDevice("speedkittaking-live-cache")).not.toContain("base/p/ann"));
    expect(await dumpDevice("speedkittaking-live-cache")).not.toContain("Entry 1");
    expect(k.hub.currentPrincipal()).toBeNull();
  });

  test("L7 hosts: every request goes to the pinned vault's origin or the sign-in origin, and nowhere else", async () => {
    const k = await bootLive();
    const net = fakeNet();
    const { user } = await liveApp(k, net);
    await signInLive(user);
    await screen.findByTestId("entry-e1");
    await user.click(screen.getByTestId("nav-entry-e1"));
    const all = [...net.urls, ...net.signInUrls];
    expect(all.length).toBeGreaterThan(4);
    for (const u of all) expect([VAULT_ORIGIN, PLATFORM], u).toContain(new URL(u).origin);
    for (const u of net.records()) expect(new URL(u).origin, u).toBe(VAULT_ORIGIN); // the list is read at the vault, not the platform apex
    for (const u of net.urls.filter((x) => x.endsWith("/lws/vaults"))) expect(new URL(u).origin).toBe(PLATFORM);
    expect(net.signInUrls.length).toBeGreaterThan(0);
    for (const u of net.signInUrls) expect(new URL(u).origin).toBe(PLATFORM);
    for (const u of net.records()) expect(net.headers[u]!.get("authorization")).toMatch(/^DPoP /); // signed, and only there
    // every request is a read
    expect(net.records().every((u) => u.includes(encodeURIComponent(VAULT)))).toBe(true);
  });
});
