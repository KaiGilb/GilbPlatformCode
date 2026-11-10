// T8: the platform behind the stand-in is the shared fake-platform unit, which answers only the platform's routes with the platform's shapes
// (its own honesty rule: a request no route row answers is recorded in `violations` and answered 404). This test is the app's side of it:
// the app sends nothing the platform does not have. (It replaces the old T8, which tested a hand-made stand-in's own refusals.)
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { completeCopy } from "@kaigilb/gilbplatformcode-speed-kit/complete-copy";
import { ANN, boot, click, settled } from "./helpers";

const KEYS_THE_PLATFORM_HAS = ["type", "include", "limit", "offset", "after", "since", "lifecycle", "filter"];

describe("T8 platform honesty", () => {
  test("T8 a whole flow (sign in, list, open an entry, rename) sends only requests the platform has: the fake records no violation", async () => {
    const k = await boot();
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    await settled();
    click("nav-entry-e1");
    fireEvent.change(screen.getByTestId("rename-input"), { target: { value: "Renamed" } });
    click("rename-button");
    await screen.findByText("Renamed.", { exact: false });
    expect(k.platform.fake.violations).toEqual([]);
    expect(k.platform.fake.calls.all.every((c) => c.status === 200 || c.status === 204)).toBe(true);
    expect(k.platform.fake.calls.all.every((c) => c.proof.ok)).toBe(true); // every call carried a good DPoP pair
  });

  test("T8 the list asks only query keys the platform's list has, the type bare; the rename is PATCH /lws/r/<id> with a merge patch on a:name", async () => {
    const k = await boot();
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    await settled();
    click("nav-entry-e1");
    fireEvent.change(screen.getByTestId("rename-input"), { target: { value: "Renamed" } });
    click("rename-button");
    await waitFor(() => expect(k.platform.fake.calls.of("PATCH /lws/r/:id")).toHaveLength(1));
    for (const c of k.platform.fake.calls.of("GET /lws/vault/:vault/records")) {
      expect(Object.keys(c.query).every((key) => KEYS_THE_PLATFORM_HAS.includes(key)), c.url).toBe(true);
      expect(c.query.type).toEqual(["CatalogEntry"]);
    }
    const patch = k.platform.fake.calls.last("PATCH /lws/r/:id")!;
    expect(patch.path).toBe("/lws/r/e1");
    expect(patch.headers["content-type"]).toBe("application/merge-patch+json");
    expect(patch.body).toEqual({ "a:name": "Renamed" });
    expect(k.platform.nameOf(ANN, "e1")).toBe("Renamed");
  });

  test("T8 completeCopy walks the platform by after= and the since pass (30 rows, 7 a page) and ends at the platform's own cursor", async () => {
    const k = await boot();
    const { client } = await import("../src/standin");
    const copy = await completeCopy(client(ANN), ANN, "t:CatalogEntry", { pageLimit: 7 });
    expect(copy.records).toHaveLength(30);
    expect(copy.records.map((r) => r.body?.name)).toEqual(Array.from({ length: 30 }, (_, i) => `Ann entry ${i + 1}`));
    expect(copy.truncated).toBeUndefined();
    expect(copy.cursor).toMatch(/^c1\./);
    const walk = k.platform.fake.calls.of("GET /lws/vault/:vault/records").map((c) => c.query);
    expect(walk.filter((q) => q.after !== undefined)).toHaveLength(4); // 7 + 7 + 7 + 7 + 2: four pages after the first
    expect(k.platform.fake.violations).toEqual([]);
  });
});
