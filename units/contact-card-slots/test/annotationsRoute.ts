// Test-only. The annotations route (`GET` / `PUT /base/connect/annotations`) as the holder's two private fields about one party, in memory, behind `fetch`.
// It stands where the source's tests mocked `loadHolderAnnotations` and `saveHolderAnnotations`: those mocks cannot reach the real unit (the save is made
// inside `contact-annotation`), so the route is stubbed at the wire instead. `gets` counts the reads, `saves` keeps each write's body and `keepalive`.
import { vi } from "vitest";

export const route = { note: "", origin: "", failLoad: false, saves: [] as Record<string, unknown>[], gets: [] as string[], origins: [] as string[] };

export function resetRoute(): void {
  route.note = "";
  route.origin = "";
  route.failLoad = false;
  route.saves.length = 0;
  route.gets.length = 0;
  route.origins.length = 0;
}

/** Wraps the current global `fetch`: the annotations route is answered here, everything else goes on to it. The GET echoes the vault it was asked at (`<origin>/base`); `vault` is the address of the card's own vault, for the notes' entity addresses. */
export function installAnnotationsRoute(vault: string): void {
  const inner = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith("/base/connect/annotations")) return inner(input as string, init);
      if ((init?.method ?? "GET") === "PUT") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        route.saves.push({ ...body, keepalive: init?.keepalive === true });
        if ("note" in body) route.note = String(body.note);
        if ("origin" in body) route.origin = String(body.origin);
        return Response.json({ heldParty: body.heldParty, changed: true });
      }
      const heldParty = url.searchParams.get("heldParty") ?? "";
      route.gets.push(heldParty);
      route.origins.push(url.origin);
      if (route.failLoad) return new Response("boom", { status: 500 });
      const one = (t: string) => (t ? [{ entity: `${vault}/e/note`, text: t }] : []);
      return Response.json({
        me: "p",
        heldParty,
        note: route.note || null,
        origin: route.origin || null,
        notes: one(route.note),
        origins: one(route.origin),
        noteLoad: route.note ? "ok" : "empty",
        originLoad: route.origin ? "ok" : "empty",
        vault: `${url.origin}/base`,
      });
    }),
  );
}
