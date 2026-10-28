// Renders the README's wiring (test/example.tsx): the provider with every prop, a Value card inside it.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { PlanScreen } from "../test/example";
import { createFakeVault, entityUriOf, VAULT } from "../test/fakeVault";
import { newSession, planGroups } from "../test/harness";

describe("the README's wiring", () => {
  beforeEach(() => __startCardsInEditMode(true));
  afterEach(() => __startCardsInEditMode(false));

  test("draws the Value card's twelve lines and signs its reads with the session", async () => {
    const vault = createFakeVault([{ id: "val1", type: "t:Value", facts: { unitTag: "Speed" }, version: 1 }]);
    vi.stubGlobal("fetch", vault.fetch);
    const session = newSession();
    const record = { id: "val1", entityUri: entityUriOf("val1"), typeUri: "t:Value", facts: { unitTag: "Speed" }, opaqueFacts: [], etag: '"v1"' } as BaseRecord;
    render(<PlanScreen session={session.session} record={record} vaultId={VAULT} canEdit />);
    await waitFor(() => expect(planGroups().length).toBe(12));
    await waitFor(() => expect(vault.requests("GET", /\/base\/find-by-attribute\?/).length).toBeGreaterThan(0));
    expect(session.signed.length).toBeGreaterThan(0);
  });
});
