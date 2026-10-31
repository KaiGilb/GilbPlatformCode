// What the app hands the provider and the card, read at the seam: the real provider and the real card are mounted, and their props are
// recorded on the way in. (App.test.tsx proves the same things through the page; this reads each prop by name.)
import { beforeEach, describe, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const seen = vi.hoisted(() => ({ provider: [] as Record<string, unknown>[], card: [] as Record<string, unknown>[] }));

vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform", async (importOriginal) => {
  const real = await importOriginal<typeof import("@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform")>();
  return {
    ...real,
    StakeholderCardGilbPlatformProvider: (props: Record<string, unknown>) => {
      seen.provider.push(props);
      return real.StakeholderCardGilbPlatformProvider(props as never);
    },
  };
});
vi.mock("@kaigilb/gilbplatformcode-online-stakeholder-card", async (importOriginal) => {
  const real = await importOriginal<typeof import("@kaigilb/gilbplatformcode-online-stakeholder-card")>();
  return {
    ...real,
    OnlineStakeholderCard: (props: Record<string, unknown>) => {
      seen.card.push(props);
      return real.OnlineStakeholderCard(props as never);
    },
  };
});

import { TEST_SETTINGS, signedInApp } from "../test/helpers";
import { BEN } from "../test/world";

beforeEach(() => {
  seen.provider.length = 0;
  seen.card.length = 0;
});

const OPTIONAL = { ...TEST_SETTINGS, ontologyApiOrigin: "https://search.example.test", minOntologyQuery: "4", localRigHosts: "rig.example.test" };

describe("the props the app passes", () => {
  test("the saved settings reach the provider, and the callbacks and session are the app's", async () => {
    const { credential } = await signedInApp({}, OPTIONAL);
    const last = seen.provider.at(-1)!;
    expect(last.origin).toBe(TEST_SETTINGS.origin);
    expect(last.ontologyOrigin).toBe(TEST_SETTINGS.ontologyOrigin);
    expect(last.geoOrigin).toBe(TEST_SETTINGS.geoOrigin);
    expect(last.systemVaultHosts).toEqual(["ontology.platform.example.test"]);
    expect(last.systemHostLabels).toEqual(["id", "ontology"]);
    expect(last.session).toBe(credential);
    expect(typeof last.onOpenRecord).toBe("function");
    // The second argument of onOpenRecord is the door (since the host 0.4.0): the app takes both.
    expect((last.onOpenRecord as (...a: unknown[]) => void).length).toBe(2);
    expect(Object.keys(last).sort()).toEqual(["children", "geoOrigin", "onOpenRecord", "ontologyOrigin", "origin", "session", "settings", "systemHostLabels", "systemVaultHosts"]);
  });

  test("the optional settings arrive in the provider's settings prop with the MyNet profile address", async () => {
    await signedInApp({}, OPTIONAL);
    expect(seen.provider.at(-1)!.settings).toEqual({ ontologyApiOrigin: "https://search.example.test", minOntologyQuery: 4, localRigHosts: ["rig.example.test"], mynetProfileUrl: "https://mynet.example.test/profile" });
  });

  test("the DPoP proof origin reaches the provider's settings; empty means absent", async () => {
    await signedInApp({}, { ...TEST_SETTINGS, dpopProofOrigin: " https://id.example.test " });
    expect(seen.provider.at(-1)!.settings).toEqual({ dpopProofOrigin: "https://id.example.test", mynetProfileUrl: "https://mynet.example.test/profile" });
  });

  test("the MyNet profile address reaches the provider's settings, trimmed", async () => {
    await signedInApp({}, { ...TEST_SETTINGS, mynetProfileUrl: " https://mynet.example.test/profile " });
    expect(seen.provider.at(-1)!.settings).toEqual({ mynetProfileUrl: "https://mynet.example.test/profile" });
  });

  test("with no optional setting the provider's settings hold the MyNet profile address alone", async () => {
    await signedInApp();
    expect(seen.provider.at(-1)!.settings).toEqual({ mynetProfileUrl: "https://mynet.example.test/profile" });
  });

  test("the card gets the typed principal, and the placement defaults to content", async () => {
    await signedInApp();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Person's principal/), BEN);
    await user.click(screen.getByRole("button", { name: "Show card" }));
    await waitFor(() => expect(seen.card.length).toBeGreaterThan(0));
    expect(seen.card.at(-1)).toEqual({ principal: BEN, placementMode: "content" });
  });
});
