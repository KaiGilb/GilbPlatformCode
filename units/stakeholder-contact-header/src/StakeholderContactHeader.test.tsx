import { describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { fakeHost, newClient, OTHER, OWN, vaultOf, Wrap } from "../test/fakeHost";
import { controllerOf, drawHeader, personCardOf, readyCard, REC, TYPE, VIEWER } from "../test/draw";
import {
  GILBAPP_CHIP_HELP,
  StakeholderContactHeader,
  holderCaption,
  holderFaceKey,
  holderPersonName,
  isOwnVault,
  useHolderFace,
  useHolderPersonName,
} from "./index";

type KeptOptions = { staleTime?: unknown; gcTime?: unknown; retry?: unknown; refetchOnWindowFocus?: unknown };
const optionsOf = (q: { options: unknown }) => q.options as KeptOptions;
const text = (id: string) => screen.getByTestId(id).textContent;

describe("the data helpers", () => {
  test("holderFaceKey is the key the app shares", () => {
    expect(holderFaceKey("https://holder.example.test/vault")).toEqual(["s5b-holder-face", "https://holder.example.test/vault"]);
  });
  test("isOwnVault: the landing flag, or the same id ignoring trailing slashes; never for a null own id", () => {
    expect(isOwnVault({ vaultId: "https://a.example.test/v", isLandingVault: true }, null)).toBe(true);
    expect(isOwnVault({ vaultId: "https://a.example.test/v//", isLandingVault: false }, "https://a.example.test/v")).toBe(true);
    expect(isOwnVault({ vaultId: "https://a.example.test/v", isLandingVault: false }, null)).toBe(false);
    expect(isOwnVault({ vaultId: "https://a.example.test/v", isLandingVault: false }, "")).toBe(false);
  });
  test("holderCaption trims the type and cuts its local name; a blank type reads 'Vault'", () => {
    const v = { vaultId: "https://a.example.test/v", isLandingVault: false };
    expect(holderCaption({ ...v, represents: "  https://ontology.example.test/base/t/Project  " }, null)).toBe("Project vault");
    expect(holderCaption({ ...v, represents: "t:Organization" }, null)).toBe("Organization vault");
    expect(holderCaption({ ...v, represents: "   " }, null)).toBe("Vault");
  });
  test("holderPersonName: the card's name trimmed, else the vault's label", () => {
    expect(holderPersonName(vaultOf(), "  Dee Owner ")).toBe("Dee Owner");
    expect(holderPersonName(vaultOf(), "   ")).toBe("Cy Holder");
    expect(holderPersonName(vaultOf({ name: null }), null)).toBe("vault");
    expect(holderPersonName(vaultOf({ name: null, vaultId: "https://dee.example.test/base" }), null)).toBe("dee");
  });
  test("GILBAPP_CHIP_HELP is the app's sentence", () => {
    expect(GILBAPP_CHIP_HELP).toBe("How they relate to this vault, for you only. It gives them no access to anything.");
  });
});

describe("the host seam is a context that throws, naming itself", () => {
  test("the header without a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const props = {
        holderVault: vaultOf(), ownVaultId: OWN, viewer: null, record: REC, ownName: "Ann", kind: null, kindLabel: "Person",
        personCard: null, onlineCard: null, ownPicture: null,
      };
      expect(() =>
        render(createElement(QueryClientProvider, { client: newClient() }, createElement(StakeholderContactHeader, props))),
      ).toThrow("The stakeholder contact header needs a StakeholderContactHeaderHostContext.Provider above it.");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the holder's face (host: discoverVaultProfilePhoto, loadPhotoObjectUrl)", () => {
  test("discovery is asked with the vault's entity and id; the photo is loaded with the reference and the vault id as the door", async () => {
    const fake = fakeHost();
    vi.mocked(fake.host.discoverVaultProfilePhoto).mockResolvedValue({ photoRef: "/files/f1", personName: " Dee Owner " });
    drawHeader({}, { fake });
    await waitFor(() => expect(fake.host.loadPhotoObjectUrl).toHaveBeenCalledTimes(1));
    expect(fake.host.discoverVaultProfilePhoto).toHaveBeenCalledWith("https://holder.example.test/base/e/vault-holder", OWN);
    expect(fake.host.loadPhotoObjectUrl).toHaveBeenCalledWith("/files/f1", OWN);
    const img = await waitFor(() => {
      const el = screen.getByTestId("contact-header-holder-image").querySelector("img");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(img.getAttribute("src")).toBe("blob:/files/f1");
    expect(text("contact-header-holder-name")).toContain("Dee Owner");
  });
  test("no photo reference: the photo is not asked for, and the holder's initials are drawn", async () => {
    const fake = fakeHost();
    drawHeader({}, { fake });
    await waitFor(() => expect(fake.host.discoverVaultProfilePhoto).toHaveBeenCalledTimes(1));
    expect(fake.host.loadPhotoObjectUrl).not.toHaveBeenCalled();
    expect(screen.getByTestId("contact-header-holder-image").querySelector("img")).toBeNull();
    expect(text("contact-header-holder-image")).toBe("CH");
    expect(screen.getByTestId("contact-header-holder-image").getAttribute("title")).toBe("Cy Holder: the vault this card is seen from");
  });
  test("a blank name from the card falls back to the vault's label", async () => {
    const fake = fakeHost();
    vi.mocked(fake.host.discoverVaultProfilePhoto).mockResolvedValue({ photoRef: null, personName: "   " });
    drawHeader({}, { fake });
    await waitFor(() => expect(fake.host.discoverVaultProfilePhoto).toHaveBeenCalled());
    expect(text("contact-header-holder-name")).toContain("Cy Holder");
  });
  test("the face is read once per vault, kept for the session: staleTime and gcTime Infinity, no retry", async () => {
    const fake = fakeHost();
    const { qc, unmount } = drawHeader({}, { fake });
    await waitFor(() => expect(fake.host.discoverVaultProfilePhoto).toHaveBeenCalledTimes(1));
    const q = qc.getQueryCache().find({ queryKey: holderFaceKey(OWN) })!;
    expect(optionsOf(q).staleTime).toBe(Infinity);
    expect(optionsOf(q).gcTime).toBe(Infinity);
    expect(optionsOf(q).retry).toBe(false);
    expect(optionsOf(q).refetchOnWindowFocus).toBe(false);
    unmount();
    drawHeader({}, { fake, qc });
    await waitFor(() => expect(screen.getByTestId("contact-header-holder-image")).toBeTruthy());
    expect(fake.host.discoverVaultProfilePhoto).toHaveBeenCalledTimes(1);
  });
  test("a failed discovery is not retried and leaves the initials", async () => {
    const fake = fakeHost();
    vi.mocked(fake.host.discoverVaultProfilePhoto).mockRejectedValue(new Error("down"));
    drawHeader({}, { fake });
    await waitFor(() => expect(fake.host.discoverVaultProfilePhoto).toHaveBeenCalledTimes(1));
    expect(text("contact-header-holder-image")).toBe("CH");
    expect(fake.host.discoverVaultProfilePhoto).toHaveBeenCalledTimes(1);
  });
  test("a vault with no id reads nothing (hooks useHolderFace and useHolderPersonName)", async () => {
    const fake = fakeHost();
    const qc = newClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(Wrap, { host: fake.host, qc, children });
    const { result } = renderHook(() => ({ face: useHolderFace(vaultOf({ vaultId: "" })), name: useHolderPersonName(null) }), { wrapper });
    expect(result.current).toEqual({ face: null, name: null });
    expect(fake.host.discoverVaultProfilePhoto).not.toHaveBeenCalled();
  });
});

describe("their face (host: loadGranteeFace)", () => {
  test("asked with their principal and the viewer when their card shares a photo; the face is drawn", async () => {
    const fake = fakeHost();
    vi.mocked(fake.host.loadGranteeFace).mockResolvedValue("blob:their");
    const principal = "https://id.example.test/base/p/bea";
    const { qc } = drawHeader({ onlineCard: controllerOf(readyCard({ given: "Bea", family: "Stone", photoUrl: "/base/connect/profile-photo?principal=x", principal })) }, { fake });
    await waitFor(() => expect(fake.host.loadGranteeFace).toHaveBeenCalledTimes(1));
    expect(fake.host.loadGranteeFace).toHaveBeenCalledWith(principal, VIEWER);
    await waitFor(() => expect(screen.getByTestId("contact-card-avatar").getAttribute("data-has-photo")).toBe("true"));
    const q = qc.getQueryCache().find({ queryKey: ["s5b-their-face", VIEWER, principal] })!;
    expect(optionsOf(q).staleTime).toBe(Infinity);
    expect(optionsOf(q).retry).toBe(false);
    expect(optionsOf(q).refetchOnWindowFocus).toBe(false);
    expect(text("contact-card-name")).toBe("Bea Stone");
  });
  test("their card shares no photo: not asked; the record's own name stands when their card shows none", () => {
    const fake = fakeHost();
    drawHeader({ onlineCard: controllerOf(readyCard({ photoUrl: null })) }, { fake });
    expect(fake.host.loadGranteeFace).not.toHaveBeenCalled();
    expect(text("contact-card-name")).toBe("Ann Larsen");
  });
  test("no online card: not asked", () => {
    const fake = fakeHost();
    drawHeader({}, { fake });
    expect(fake.host.loadGranteeFace).not.toHaveBeenCalled();
  });
  test("the viewer may be null: the key keeps an empty string for it", async () => {
    const fake = fakeHost();
    const principal = "https://id.example.test/base/p/bea";
    const { qc } = drawHeader({ viewer: null, onlineCard: controllerOf(readyCard({ photoUrl: "/p", principal })) }, { fake });
    await waitFor(() => expect(fake.host.loadGranteeFace).toHaveBeenCalledWith(principal, null));
    expect(qc.getQueryCache().find({ queryKey: ["s5b-their-face", "", principal] })).toBeTruthy();
  });
  test("the controller is loaded once when the card opens", () => {
    const c = controllerOf(readyCard({}));
    drawHeader({ onlineCard: c });
    expect(c.load).toHaveBeenCalledTimes(1);
  });
});

describe("the Where / How we met line (host: useHolderOriginLine, a hook)", () => {
  test("called on every render with the holder's vault, own vault, record address, and the person the record is linked to", () => {
    const fake = fakeHost();
    fake.state.origin = { origin: "Oslo, 2026", loading: false };
    drawHeader({ personCard: personCardOf({ party: "https://id.example.test/base/p/bea", how: "placement", link: { state: "linked", target: "x" }, anchor: { kind: "person", principal: "p", entity: "e" } }) }, { fake });
    expect(fake.state.originCalls.at(-1)).toEqual({
      vaultId: OWN,
      ownVaultId: OWN,
      recordEntityUri: REC.entityUri,
      linkedParty: "https://id.example.test/base/p/bea",
      linked: true,
      linkedLookupFailed: false,
      linkAnswer: "person",
    });
    expect(screen.getByTestId("contact-card-origin-inline").textContent).toContain("Oslo, 2026");
  });
  test("an unlinked record with no person card: not linked, no lookup failure, no answer", () => {
    const fake = fakeHost();
    drawHeader({}, { fake });
    expect(fake.state.originCalls.at(-1)).toEqual({
      vaultId: OWN, ownVaultId: OWN, recordEntityUri: REC.entityUri, linkedParty: null, linked: false, linkedLookupFailed: false, linkAnswer: null,
    });
  });
  test("linked by the record's own link even when the person could not be named: the lookup failed", () => {
    const fake = fakeHost();
    drawHeader({ personCard: personCardOf({ party: null, link: { state: "linked", target: "x" } }), onlineCard: controllerOf({ link: { state: "linked", target: "x" } }) }, { fake });
    const last = fake.state.originCalls.at(-1)!;
    expect(last.linked).toBe(true);
    expect(last.linkedLookupFailed).toBe(true);
    expect(last.linkedParty).toBeNull();
  });
  test("the own card: the record address is null, so nothing about him as a contact is read", () => {
    const fake = fakeHost();
    drawHeader({ ownCard: true }, { fake });
    expect(fake.state.originCalls.at(-1)!.recordEntityUri).toBeNull();
    expect(fake.state.labelsCalls.at(-1)!.enabled).toBe(false);
    expect(fake.state.relationsCalls.at(-1)).toEqual({ id: REC.id, at: null });
  });
  test("while the line is loading the header says so", () => {
    const fake = fakeHost();
    fake.state.origin = { origin: null, loading: true };
    drawHeader({}, { fake });
    expect(document.body.textContent).toContain("Loading where you met");
  });
});

describe("the caption and the badge", () => {
  const caption = () => text("contact-card-caption");
  test("own card", () => {
    drawHeader({ ownCard: true });
    expect(caption()).toBe("Person · your own card");
  });
  test("linked by the resolver: 'online card', and the chain-link badge", () => {
    drawHeader({ personCard: personCardOf({ party: "p", how: "sameAs" }) });
    expect(caption()).toBe("Person · online card");
    expect(screen.queryByTestId("contact-card-link-note")).not.toBeNull();
  });
  test("the record carries a link the resolver does not follow: 'linked, not open to you now', and the badge", () => {
    drawHeader({ onlineCard: controllerOf({ link: { state: "linked", target: "x" } }) });
    expect(caption()).toBe("Person · linked, not open to you now");
    expect(screen.queryByTestId("contact-card-link-note")).not.toBeNull();
  });
  test("no link: 'your card only', no badge", () => {
    drawHeader({});
    expect(caption()).toBe("Person · your card only");
    expect(screen.queryByTestId("contact-card-link-note")).toBeNull();
  });
  test("the contact's image shape is from the kind: a kind under Person is a circle, another is a rounded square", () => {
    drawHeader({ kind: { kind: "https://ontology.example.test/base/t/Customer", ancestors: [TYPE] } });
    expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("circle");
    cleanup();
    drawHeader({ kind: { kind: "https://ontology.example.test/base/t/Organization", ancestors: [] } });
    expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("rounded-square");
  });
});

describe("the circles (placement chips)", () => {
  const placed = personCardOf({ party: "p", how: "placement", placements: [{ context: "personal", depth: "first-degree" }, { context: "professional", depth: "close-circle" }] });
  test("drawn, with the access meaning and the app's help, when the card is seen from the holder's own vault", () => {
    drawHeader({ personCard: placed });
    const chips = screen.getAllByTestId("person-placement-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["Personal 1st Connection", "Professional Inner Circle"]);
    expect(chips.map((c) => c.getAttribute("data-meaning"))).toEqual(["access", "access"]);
    expect(chips[0]!.getAttribute("title")).toBe("You placed them in this circle. It decides what of yours they can see. Change it in MyNet.");
    expect(chips[0]!.getAttribute("data-context")).toBe("personal");
    expect(chips[1]!.getAttribute("data-depth")).toBe("close-circle");
  });
  test("not drawn seen from another vault", () => {
    drawHeader({ personCard: placed, holderVault: vaultOf({ vaultId: OTHER, isLandingVault: false }) });
    expect(screen.queryAllByTestId("person-placement-chip")).toEqual([]);
  });
  test("not drawn when the person is only known through the link", () => {
    drawHeader({ personCard: { ...placed, how: "sameAs" } });
    expect(screen.queryAllByTestId("person-placement-chip")).toEqual([]);
  });
});

describe("the own picture", () => {
  test("drawn when their card shares no photo, with the header's image and the contact's initials", () => {
    const ownPicture = vi.fn((image: { shape: string }, initials: string) => createElement("i", { "data-testid": "own-picture" }, `${image.shape}:${initials}`));
    drawHeader({ ownPicture: ownPicture as never });
    expect(ownPicture).toHaveBeenCalled();
    expect(ownPicture.mock.calls.at(-1)![1]).toBe("AL");
    expect(text("own-picture")).toMatch(/^(circle|rounded-square):AL$/);
  });
  test("not drawn when their card shares a photo", async () => {
    const fake = fakeHost();
    vi.mocked(fake.host.loadGranteeFace).mockResolvedValue("blob:their");
    const ownPicture = vi.fn(() => createElement("i", { "data-testid": "own-picture" }));
    drawHeader({ ownPicture: ownPicture as never, onlineCard: controllerOf(readyCard({ photoUrl: "/p" })) }, { fake });
    await waitFor(() => expect(screen.getByTestId("contact-card-avatar").getAttribute("data-has-photo")).toBe("true"));
    expect(screen.queryByTestId("own-picture")).toBeNull();
  });
});

describe("'+ Relation' and the chooser", () => {
  test("the chooser carries the app's help, the lists' note, the loading flag; closing it closes it, and a pick closes and goes through add", async () => {
    const fake = fakeHost();
    const e = { id: "k1", label: "Customer", order: 1, playableBy: [], axis: "relationshipKind" as const, own: false };
    fake.state.offered = { circleLabel: [], relationshipKind: [e] };
    fake.state.catalogueNote = "Showing 500 of 530 of your own kinds.";
    drawHeader({}, { fake });
    fireEvent.click(await screen.findByTestId("contact-header-add-relation"));
    const dlg = await screen.findByTestId("contact-kind-chooser");
    expect(screen.getByTestId("contact-kind-chooser-help").textContent).toBe(GILBAPP_CHIP_HELP);
    expect(screen.getByTestId("contact-kind-chooser-note").textContent).toBe("Showing 500 of 530 of your own kinds.");
    expect(dlg).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByTestId("contact-kind-chooser")).toBeNull();
    fireEvent.click(screen.getByTestId("contact-header-add-relation"));
    fireEvent.click(await screen.findByTestId("contact-kind-option"));
    expect(fake.state.add).toHaveBeenCalledWith(e);
    expect(screen.queryByTestId("contact-kind-chooser")).toBeNull();
  });
  test("an act that did not happen is said under the header", () => {
    const fake = fakeHost();
    fake.state.actError = "Kinds of contact are kept in your own vault only.";
    drawHeader({}, { fake });
    expect(text("contact-header-relation-note")).toBe("Kinds of contact are kept in your own vault only.");
  });
  test("no note when there is nothing to say", () => {
    drawHeader({});
    expect(screen.queryByTestId("contact-header-relation-note")).toBeNull();
  });
  test("the own card draws no relation and no '+ Relation', even from a host that answers chips for every subject", () => {
    const fake = fakeHost();
    fake.state.labelsForAny = { chips: [{ key: "c", axis: "relationshipKind", entryId: "e", label: "Friend", tone: "neutral", claimId: "x" }], preds: { e: null } };
    drawHeader({ ownCard: true }, { fake });
    expect(screen.queryAllByTestId("contact-header-relation")).toEqual([]);
    expect(screen.queryByTestId("contact-header-add-relation")).toBeNull();
    cleanup();
    drawHeader({}, { fake });
    expect(screen.queryAllByTestId("contact-header-relation").map((c) => c.textContent)).toEqual(["Friend"]);
  });
});
