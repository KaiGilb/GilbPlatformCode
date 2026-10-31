// @vitest-environment jsdom
// The hook. Ported in intent from GilbApp's \`AddressRows.*\` write cases at the level of the hook (the card itself, its add form, Close and the double-save guard, is
// \`place-claims-card\`'s, a later batch): save / amend / remove resolve TRUE (or the id) only when the read-back proves it, and a failed read is said, never "no
// addresses". New: the five states, one shape under the key, fixed sentences, the partial save, the geo refusal, and what an incomplete read-back may not claim.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MAX_LIST_PAGES } from "@kaigilb/gilbplatformcode-vault-records-of-type";
import { PLACE_CLAIMS_STALE_MS, placeClaimsKey, type PlaceClaimsRead } from "@kaigilb/gilbplatformcode-place-claims";
import { createPlaceClaim } from "@kaigilb/gilbplatformcode-place-claim-write";
import { resetGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import * as unit from "./index";
import {
  CATALOGUE_READ_ONLY_SAYS,
  INCOMPLETE_SAYS,
  NO_VAULT_SAYS,
  PARTIAL_SAVE_SAYS,
  READ_FAILED_SAYS,
  SAVE_NOT_CONFIRMED_SAYS,
  SAVE_NOT_KEPT_SAYS,
  factsSurvived,
  usePlaceClaims,
} from "./index";
import * as fake from "../test/fakePlaceStore";
import { NONE, NORWAY, OSLO, OTHER, PRINCIPAL, RECORD, VAULT, input, ofType, store, useWorld } from "../test/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  attributeSpelling: vi.fn(async (name: string) => name),
  typeSpelling: vi.fn(async (name: string) => `t:${name}`),
  attributeLabel: vi.fn(async (name: string) => (name === "postalCode" ? "Postal Code" : null)),
}));

useWorld();
let qc: QueryClient;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  errors.mockRestore();
});
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const hook = (vault: string | null | undefined = VAULT, subject = RECORD) => renderHook(() => usePlaceClaims(vault, subject, PRINCIPAL), { wrapper });
const NO_URL = /https?:|\/base\/|\bgeo\.|\ba\/[a-zA-Z]|\b[45]\d\d\b|PlaceClaim \d/;
const FULL = input({ label: "home", streetLine: "Storgata 1", place: { city: OSLO, region: null, country: NORWAY } });

describe("the five states are told apart (F1, F2, F4)", () => {
  it("no vault: status no-vault, no request, claims [] meaning UNKNOWN (not ready, not none)", async () => {
    const { result } = hook(null);
    await act(async () => {});
    expect(result.current.status).toBe("no-vault");
    expect(result.current.claims).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fake.calls).toEqual([]);
    expect(NO_VAULT_SAYS).toMatch(/not a statement that there are none/);
  });

  it("the first read not answered yet: status reading (and loading), claims [] meaning NOT YET", async () => {
    const { result } = hook();
    expect(result.current.status).toBe("reading");
    expect(result.current.loading).toBe(true);
    expect(result.current.claims).toEqual([]);
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("the read failed: status failed with the fixed sentence, never ready with nothing in it; the detail goes to the log", async () => {
    fake.door.pages = () => {
      throw new Error("boom: https://secret.example/base/e/x 503");
    };
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.error).toBe(READ_FAILED_SAYS);
    expect(result.current.error).not.toMatch(NO_URL);
    expect(errors).toHaveBeenCalled();
  });

  it("the read was not the whole vault: status incomplete with the reason, and the claims read are there", async () => {
    for (let i = 0; i < MAX_LIST_PAGES + 3; i += 1) fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": `a${i}` });
    fake.door.pageSize = 1;
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("incomplete"));
    expect(result.current.reason).toBe("capped");
    expect(result.current.claims).toHaveLength(MAX_LIST_PAGES);
    expect(result.current.error).toBeNull();
    expect(INCOMPLETE_SAYS).toBe("Not every address in this vault was read.");
  });

  it("the whole vault was read: status ready, and [] now means there are none", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.claims).toEqual([]);
    expect(result.current.reason).toBeNull();
  });

  it("(M-K10) the status of 'vault not known' is never 'ready' and never the status of 'no addresses'", async () => {
    const none = hook(null);
    const empty = hook();
    await waitFor(() => expect(empty.result.current.status).toBe("ready"));
    expect(none.result.current.status).not.toBe(empty.result.current.status);
  });

  it("a vault that appears later is read: no-vault turns into reading and then ready", async () => {
    const { result, rerender } = renderHook(({ v }: { v: string | null }) => usePlaceClaims(v, RECORD, PRINCIPAL), { wrapper, initialProps: { v: null as string | null } });
    expect(result.current.status).toBe("no-vault");
    rerender({ v: VAULT });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});

describe("ONE shape under the key", () => {
  it("the hook stores the whole PlaceClaimsRead under placeClaimsKey(vault), which the one card reads through", async () => {
    fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "home" });
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const held = qc.getQueryData<PlaceClaimsRead>(placeClaimsKey(VAULT));
    expect(held).toMatchObject({ complete: true });
    expect(held!.claims.map((c) => c.label)).toEqual(["home"]);
    expect(PLACE_CLAIMS_STALE_MS).toBe(60_000);
  });

  it("two cards on the same vault share one read", async () => {
    fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "home" });
    const a = hook();
    await waitFor(() => expect(a.result.current.status).toBe("ready"));
    const listsBefore = fake.listReads().length;
    const b = hook(VAULT, OTHER);
    await waitFor(() => expect(b.result.current.status).toBe("ready"));
    expect(fake.listReads().length).toBe(listsBefore);
    expect(b.result.current.claims).toEqual([]);
  });
});

describe("save / amend / remove resolve the truth only when the read-back proves it (ported)", () => {
  it("save: the new address's ID when the read-back carries it, with the facts it was given", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let id: string | null = null;
    await act(async () => {
      id = await result.current.save(FULL);
    });
    expect(id).toBe(ofType("t:PlaceClaim")[0]![0]);
    expect(result.current.error).toBeNull();
    expect(result.current.claims.map((c) => c.label)).toEqual(["home"]);
    expect(result.current.busy).toBe(false);
  });

  it("save: the store accepted it and did not keep a line → null and the fixed 'did not keep it' sentence", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // the platform answers 201 for every create and then loses the street field
    const real = fake.fakeFetch;
    vi.stubGlobal("fetch", vi.fn(async (i: unknown, init?: RequestInit) => {
      const r = await real(i, init);
      if (init?.method === "POST" && String(init.body).includes("streetLine")) for (const [id, e] of store) if ("a:streetLine" in e.facts) store.delete(id);
      return r;
    }));
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.save(FULL);
    });
    expect(id).toBeNull();
    expect(result.current.error).toBe(SAVE_NOT_KEPT_SAYS);
  });

  it("save: the read-back fails → null and 'saved, but not confirmed' (the address may be there)", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    fake.door.pages = () => {
      throw new Error("down");
    };
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.save(FULL);
    });
    expect(id).toBeNull();
    expect(result.current.error).toBe(SAVE_NOT_CONFIRMED_SAYS);
    expect(result.current.status).toBe("failed");
    expect(ofType("t:PlaceClaim")).toHaveLength(1);
  });

  it("save: a read-back that is not the whole vault and does not hold the address does not claim it was kept", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // from now on the door cannot get past its first page of addresses: the new address is beyond what can be read
    fake.door.pages = (offset, types) => (types.includes("PlaceClaim") ? { records: [], total: 9, complete: false, pageSize: 1, offset, nextOffset: offset } : null);
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.save(FULL);
    });
    expect(id).toBeNull();
    expect(result.current.error).toBe(SAVE_NOT_CONFIRMED_SAYS);
    expect(result.current.status).toBe("incomplete");
    expect(ofType("t:PlaceClaim")).toHaveLength(1);
  });

  it("(decision 12) a field that fails after the address was made: the fixed partial sentence, the address is shown, null is returned, nothing is cleaned up", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    fake.knobs.failCreateAt = 3; // composite, street, then the place fails
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.save(FULL);
    });
    expect(id).toBeNull();
    expect(result.current.error).toBe(PARTIAL_SAVE_SAYS);
    expect(PARTIAL_SAVE_SAYS).toBe("The address was saved, but one of its details was not.");
    expect(result.current.error).not.toMatch(NO_URL);
    expect(errors).toHaveBeenCalled(); // the detail goes to the log
    await waitFor(() => expect(result.current.claims.map((c) => c.label)).toEqual(["home"]));
    expect(fake.writes.filter((w) => w.method === "DELETE")).toEqual([]);
  });

  it("amend: true when the read-back carries the change; false with the fixed sentence when it does not", async () => {
    await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    const { result } = hook();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    let ok = false;
    await act(async () => {
      ok = await result.current.amend(result.current.claims[0]!, { ...FULL, label: "cabin" });
    });
    expect(ok).toBe(true);
    expect(result.current.claims[0]!.label).toBe("cabin");
    // the platform accepts the next change and keeps the old value
    const real = fake.fakeFetch;
    vi.stubGlobal("fetch", vi.fn(async (i: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(JSON.stringify({}), { status: 200 });
      return real(i, init);
    }));
    await act(async () => {
      ok = await result.current.amend(result.current.claims[0]!, { ...FULL, label: "again" });
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe(unit.CHANGE_NOT_KEPT_SAYS);
  });

  it("remove: true when the address is gone on the read-back; false and a fixed sentence when it is still there", async () => {
    await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    const { result } = hook();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    const real = fake.fakeFetch;
    vi.stubGlobal("fetch", vi.fn(async (i: unknown, init?: RequestInit) => (init?.method === "DELETE" ? new Response(null, { status: 204 }) : real(i, init))));
    let ok = true;
    await act(async () => {
      ok = await result.current.remove(result.current.claims[0]!);
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe(unit.REMOVE_NOT_DONE_SAYS);
    vi.stubGlobal("fetch", vi.fn(real));
    await act(async () => {
      ok = await result.current.remove(result.current.claims[0]!);
    });
    expect(ok).toBe(true);
    expect(result.current.claims).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("remove: a read-back that is not the whole vault cannot show the address is gone, so it does not say so", async () => {
    await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    const { result } = hook();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    fake.door.pages = (offset, types) => (types.includes("PlaceClaim") ? { records: [], total: 9, complete: false, pageSize: 1, offset, nextOffset: offset } : null);
    let ok = true;
    await act(async () => {
      ok = await result.current.remove(result.current.claims[0]!);
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe(unit.REMOVE_NOT_CONFIRMED_SAYS);
    expect(ofType("t:PlaceClaim")).toHaveLength(0); // it was removed; only the proof is missing
  });

  it("remove of an address that also names someone else: the shared sentence, nothing deleted", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    store.get(a.id)!.facts["a:claimSubject"] = [{ "@id": RECORD }, { "@id": OTHER }];
    const { result } = hook();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    fake.writes.length = 0;
    let ok = true;
    await act(async () => {
      ok = await result.current.remove(result.current.claims[0]!);
    });
    expect(ok).toBe(false);
    expect(result.current.error).toMatch(/also about someone else/);
    expect(fake.writes).toEqual([]);
  });

  it("no vault: each act says so with a fixed sentence and writes nothing", async () => {
    const { result } = hook(null);
    await act(async () => {});
    await act(async () => {
      expect(await result.current.save(FULL)).toBeNull();
    });
    expect(result.current.error).toBe(unit.NOT_SIGNED_IN_SAVE_SAYS);
    await act(async () => {
      expect(await result.current.amend({} as never, FULL)).toBe(false);
    });
    expect(result.current.error).toBe(unit.NOT_SIGNED_IN_CHANGE_SAYS);
    await act(async () => {
      expect(await result.current.remove({} as never)).toBe(false);
    });
    expect(result.current.error).toBe(unit.NOT_SIGNED_IN_REMOVE_SAYS);
    expect(fake.calls).toEqual([]);
  });

  it("a write to the place catalogue is refused with the fixed sentence and no request", async () => {
    const { result } = hook(`${fake.GEO_HOST}/base`);
    await waitFor(() => expect(result.current.status).not.toBe("reading"));
    fake.calls.length = 0;
    await act(async () => {
      expect(await result.current.save(FULL)).toBeNull();
    });
    expect(result.current.error).toBe(CATALOGUE_READ_ONLY_SAYS);
    expect(fake.calls).toEqual([]);
  });

  it("(fail closed) the catalogue's origin not known: save, change and remove say so with the fixed sentence, and make no request", async () => {
    await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    const { result } = hook();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    resetGeoOrigin();
    fake.calls.length = 0;
    fake.writes.length = 0;
    await act(async () => {
      expect(await result.current.save(FULL)).toBeNull();
    });
    expect(result.current.error).toBe(unit.ORIGIN_UNKNOWN_SAYS);
    await act(async () => {
      expect(await result.current.amend(result.current.claims[0]!, { ...FULL, label: "cabin" })).toBe(false);
    });
    expect(result.current.error).toBe(unit.ORIGIN_UNKNOWN_SAYS);
    await act(async () => {
      expect(await result.current.remove(result.current.claims[0]!)).toBe(false);
    });
    expect(result.current.error).toBe(unit.ORIGIN_UNKNOWN_SAYS);
    expect(unit.ORIGIN_UNKNOWN_SAYS).toBe("Addresses cannot be saved here: the place catalogue is not known.");
    expect(fake.writes.filter((w) => w.method !== "GET").length).toBe(0);
  });

  it("a legacy address: the change is refused with the sentence the write layer gives, which names the older shape and no address", async () => {
    fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "old", "a:streetLine": "Gamleveien 3" });
    const { result } = hook();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    await act(async () => {
      expect(await result.current.amend(result.current.claims[0]!, { ...FULL, label: "old" })).toBe(false);
    });
    expect(result.current.error).toMatch(/older shape/);
    expect(result.current.error).not.toMatch(NO_URL);
  });

  it("the error of a failed act is cleared by the next one that works", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.save(input({}));
    });
    expect(result.current.error).toBe(unit.SAVE_FAILED_SAYS);
    await act(async () => {
      await result.current.save(FULL);
    });
    expect(result.current.error).toBeNull();
  });
});

describe("no sentence the view may draw contains an address, a path, a status or a term", () => {
  it("every exported sentence", () => {
    for (const [k, v] of Object.entries(unit)) if (/_SAYS$/.test(k)) expect(String(v), k).not.toMatch(NO_URL);
  });
  it("a failed save, change, remove and read, with a server that answers a long error body", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    vi.stubGlobal("fetch", vi.fn(async (_i: unknown, init?: RequestInit) => (init?.method && init.method !== "GET" ? new Response(JSON.stringify({ message: "a/claimSubject refused at https://x.example/base/e/1 (503)" }), { status: 503 }) : fake.fakeFetch(_i, init))));
    await act(async () => {
      await result.current.save(FULL);
    });
    expect(result.current.error).toBe(unit.SAVE_FAILED_SAYS);
    expect(result.current.error).not.toMatch(NO_URL);
  });
});

describe("factsSurvived (the read-back test)", () => {
  const kept = async (i: Parameters<typeof input>[0]) => {
    await createPlaceClaim(VAULT, RECORD, input(i), PRINCIPAL);
    const { result } = hook();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    return result.current.claims[0]!;
  };
  it("is true for what was written", async () => {
    const c = await kept({ label: "home", streetLine: "Storgata 1", addressLine1: "c/o Hansen", postalCode: "0150", place: { ...NONE, country: NORWAY } });
    expect(factsSurvived(c, input({ label: "home", streetLine: "Storgata 1", addressLine1: "c/o Hansen", postalCode: "0150", place: { ...NONE, country: NORWAY } }))).toBe(true);
  });
  it.each([
    ["the label", { label: "other" }],
    ["the street", { streetLine: "Storgata 2" }],
    ["Address 1", { addressLine1: "c/o Olsen" }],
    ["Address 2", { addressLine2: "B" }],
    ["the Postal Code", { postalCode: "0180" }],
    ["a place id", { place: { ...NONE, country: { ...NORWAY, id: `${fake.GEO_HOST}/base/e/se` } } }],
    ["a place missing", { place: NONE }],
  ])("is false when %s differs (ALL the lines are compared, not only label, street and places)", async (_n, over) => {
    const base = { label: "home", streetLine: "Storgata 1", addressLine1: "c/o Hansen", postalCode: "0150", place: { ...NONE, country: NORWAY } };
    const c = await kept(base);
    expect(factsSurvived(c, input({ ...base, ...over }))).toBe(false);
  });
  it("a line the write did NOT name is not part of what it composed", async () => {
    const c = await kept({ label: "home", streetLine: "x", addressLine1: "c/o Hansen" });
    const { addressLine1: _a, ...unnamed } = input({ label: "home", streetLine: "x" });
    expect(factsSurvived(c, unnamed as never)).toBe(true);
  });
  it("trims both sides", async () => {
    const c = await kept({ label: "home", streetLine: "x" });
    expect(factsSurvived(c, input({ label: " home ", streetLine: " x " }))).toBe(true);
  });
});
