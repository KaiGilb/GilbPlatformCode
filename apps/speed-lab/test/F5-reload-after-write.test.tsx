// F5: a write job whose writes all succeeded must not say it failed because the list reload after them failed.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { bootLive, liveApp, signInLive } from "./liveHelpers";
import { PRINCIPAL, VAULT } from "./liveFixtures";
import { fakeVault } from "./liveVault";

const madeKey = `speedkittaking-live.made.${PRINCIPAL}.${VAULT}`;
const N = 20;
const text = (id: string) => screen.queryAllByTestId(id).map((x) => x.textContent).join("|");

/** A vault whose list answers 503 once `failWhen()` is true (the writes are never refused). */
async function boot(failWhen: (vault: ReturnType<typeof fakeVault>) => boolean) {
  const k = await bootLive();
  const vault = fakeVault();
  let armed = false;
  const net = {
    transport: vault.transport,
    inner: (async (url: string, init?: RequestInit) => {
      if (armed && failWhen(vault) && /\/records(\?|$)/.test(url)) return new Response(JSON.stringify({ error: "Busy" }), { status: 503, headers: { "content-type": "application/json" } });
      return (vault.inner as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
    }) as never,
  };
  const app = await liveApp(k, net, undefined, { allowWrite: true });
  await signInLive(app.user);
  await screen.findByTestId("entry-k1", {}, { timeout: 10000 });
  armed = true;
  return { vault, ...app };
}

describe("F5 reload after a write", () => {
  test("F5 end: every entry ended, then the list reload fails -> still 'Ended N', plus 'press Refresh'; no crash text; made-list is 0", async () => {
    const t = await boot(() => JSON.parse(localStorage.getItem(madeKey) ?? "[]").length === 0);
    const ids = Array.from({ length: N }, (_, i) => `p${i + 1}`);
    for (const id of ids) t.vault.add(id, `speedkit-proof zz ${id}`, "x");
    localStorage.setItem(madeKey, JSON.stringify(ids));
    fireEvent.click(screen.getByTestId("end-button"));
    await waitFor(() => expect(text("toast").length).toBeGreaterThan(2), { timeout: 10000 });
    expect(text("toast")).toContain(`Ended ${N} test entries.`);
    expect(text("toast")).toContain("The list could not be reloaded; press Refresh.");
    expect(text("toast") + text("notice")).not.toMatch(/Something went wrong/);
    expect(ids.every((id) => t.vault.rows.get(id)!.ended)).toBe(true);
    expect(JSON.parse(localStorage.getItem(madeKey)!)).toHaveLength(0);
    t.unmount();
  });

  test("F5 rename: the rename is written and read back, then the list reload fails -> still 'Renamed.', plus 'press Refresh'; no crash text", async () => {
    const t = await boot((v) => v.rows.get("k3")!.name === "Renamed late");
    await t.user.click(screen.getByTestId("nav-entry-k3"));
    fireEvent.change(screen.getByTestId("rename-input"), { target: { value: "Renamed late" } });
    await t.user.click(screen.getByTestId("rename-button"));
    await waitFor(() => expect(text("toast").length).toBeGreaterThan(2), { timeout: 10000 });
    expect(text("toast")).toContain("Renamed.");
    expect(text("toast")).toContain("The list could not be reloaded; press Refresh.");
    expect(text("toast") + text("notice")).not.toMatch(/Something went wrong/);
    expect(t.vault.rows.get("k3")!.name).toBe("Renamed late");
    t.unmount();
  });

  test("F5 seed: all 10 (the default count) created, then the list reload fails -> an honest 'could not check' notice (not a crash); N are made and kept", async () => {
    const t = await boot((v) => v.live().length > 3);
    await t.user.click(screen.getByTestId("seed-button"));
    await waitFor(() => expect(text("notice").length).toBeGreaterThan(2), { timeout: 10000 });
    expect(text("notice")).toMatch(/Added 10 of 10; could not check them in the list: /);
    expect(text("notice") + text("toast")).not.toMatch(/Something went wrong/);
    const made = JSON.parse(localStorage.getItem(madeKey)!) as string[];
    expect(made.length).toBe(t.vault.live().length - 3);
    expect(made.length).toBeGreaterThan(0);
    t.unmount();
  });
});

describe("F5 reproduction, kept", () => {
  test(`F5 repro: End of ${N} while a manual Refresh is clicked, list answers 503 only after the made-list is emptied -> ended, never 'Something went wrong' (3 rounds)`, async () => {
    for (let round = 0; round < 3; round++) {
      localStorage.clear();
      const t = await boot(() => JSON.parse(localStorage.getItem(madeKey) ?? "[]").length === 0);
      const ids = Array.from({ length: N }, (_, i) => `p${i + 1}`);
      for (const id of ids) t.vault.add(id, `speedkit-proof zz ${id}`, "x");
      localStorage.setItem(madeKey, JSON.stringify(ids));
      fireEvent.click(screen.getByTestId("end-button"));
      fireEvent.click(screen.getByTestId("refresh"));
      await waitFor(() => expect(text("toast").length + text("notice").length).toBeGreaterThan(2), { timeout: 10000 });
      expect(text("toast") + text("notice")).not.toMatch(/Something went wrong/);
      expect(text("toast")).toContain(`Ended ${N} test entries`);
      expect(ids.filter((id) => t.vault.rows.get(id)!.ended)).toHaveLength(N);
      t.unmount();
    }
  }, 60000);
});
