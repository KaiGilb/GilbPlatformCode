// Test support: a OneCardHost whose members do what the app's do, over plain data, and the provider that carries it.
import type { ReactNode } from "react";
import { vi } from "vitest";
import { OneCardHostContext, type GeoPlace, type OneCardHost, type PlaceClaim, type PlaceTextTerm } from "../src/oneCardHost";

export const GEO_PREFIX = "https://geo.example.test/base/e/";

/** The text slot of each term, as the app's address claim names it. */
const SLOT: Record<PlaceTextTerm, string> = { streetLine: "street", addressLine1: "line1", addressLine2: "line2", postalCode: "postal" };

/** The id of a record address, whichever of its spellings: its last path segment. */
const lastSegment = (uri: string): string => uri.replace(/\/+$/, "").split("/").pop() ?? uri;

export type FakeClaim = PlaceClaim & { subjects?: readonly string[] };

export interface FakeHost extends OneCardHost {
  listPlaceClaimsInVault: ReturnType<typeof vi.fn<(vaultId: string) => Promise<PlaceClaim[]>>>;
  loadPlaceNames: ReturnType<typeof vi.fn<(ids: readonly string[]) => Promise<GeoPlace[]>>>;
  claimsAbout: ReturnType<typeof vi.fn<(claims: readonly PlaceClaim[], subject: string) => PlaceClaim[]>>;
  claimFieldText: ReturnType<typeof vi.fn<(claim: PlaceClaim, term: PlaceTextTerm) => string>>;
  isGeoEntityId: ReturnType<typeof vi.fn<(value: unknown) => boolean>>;
  placeClaimsKey: ReturnType<typeof vi.fn<(vaultId: string) => readonly unknown[]>>;
}

export function fakeHost(over: { claims?: readonly FakeClaim[]; places?: readonly GeoPlace[]; staleMs?: number } = {}): FakeHost {
  const claims = over.claims ?? [];
  const places = over.places ?? [];
  return {
    isGeoEntityId: vi.fn((value: unknown) => typeof value === "string" && value.startsWith(GEO_PREFIX)),
    listPlaceClaimsInVault: vi.fn(async (_vaultId: string) => [...claims] as PlaceClaim[]),
    claimsAbout: vi.fn((all: readonly PlaceClaim[], subject: string) =>
      subject ? (all as readonly FakeClaim[]).filter((c) => (c.subjects ?? []).some((s) => lastSegment(s) === lastSegment(subject))) : [],
    ),
    claimFieldText: vi.fn((claim: PlaceClaim, term: PlaceTextTerm) => {
      const field = (claim.fields as unknown as readonly (Record<string, unknown> & { subject: string })[]).find((f) => f.subject === SLOT[term]);
      if (field) return (field[term] as string | undefined) ?? "";
      return term === "streetLine" ? claim.streetLine : "";
    }),
    loadPlaceNames: vi.fn(async (ids: readonly string[]) => places.filter((p) => ids.includes(p.id))),
    placeClaimsKey: vi.fn((vaultId: string) => ["mynet", "place-claims", vaultId] as const),
    placeClaimsStaleMs: over.staleMs ?? 60_000,
  };
}

export function HostProvider({ host, children }: { host: OneCardHost; children: ReactNode }) {
  return <OneCardHostContext.Provider value={host}>{children}</OneCardHostContext.Provider>;
}
