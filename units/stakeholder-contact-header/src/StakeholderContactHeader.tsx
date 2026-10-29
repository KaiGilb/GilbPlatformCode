/**
 * The stakeholder card's header in the Card view: the SHARED `ContactHeader` (unit `contact-header`), layout `auto`.
 *
 * This file does not draw the header itself: it mounts the shared header component and hands it the data. Holder (the vault the record is
 * held in) far left, the connection between (circle chips, the Where / How we met line), the contact far right, its name right-justified, the
 * chain-link badge when the record is linked.
 *
 * What this file decides (the data), and where each piece comes from:
 * - holder: the vault that HOLDS the record: its picture (read only here), its name, and its kind in words
 *   ("Me" for the holder's own vault, else "<its type's local name> vault"). Its image shape is from `represents` (`a:vaultRepresents`).
 * - chips: the circles the holder placed this person in, from the person resolver, read only, with the circle chips' words; only
 *   when the card is seen from the holder's own vault (they are his circles, not a company's or a project's).
 * - Where / How we met: the card's own annotation read (`useHolderOriginLine`, the same query as the card's group).
 * - name and photo: theirs (the online card) when it is shared with the holder, else the record's own.
 * - badge: `badge = linked || hasLink`: when the resolver links the record to an online card (`how` != "none"), or whenever the record
 *   carries one link (`a:sameAs`), even when the card cannot be read. Two links: no badge. The caption says which: "online card" when the
 *   resolver links it, "linked, not open to you now" when it does not.
 * - contact image shape: from the record's KIND in the data (the kind and its is-a ancestors, as the master serves them).
 *
 * - relations: the GilbVeda predicates that link the contact to the seen-from vault, each by the term's own label read from GilbVeda
 *   (`useHeaderRelations`, rules in `headerRelations` of `contact-kind-model`), not words like them; a kind of the holder's own with no
 *   predicate as a dashed own label; "+ Relation" last, which opens the card's EXISTING "+ Kind" chooser and writes through its existing door
 *   (no new write path).
 *
 * ⛔ Not here: navigation, search, any write of its own.
 * The card's own controls (Edit / Done, "+") are drawn by the caller in a row under this header that does not scroll.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cardName, type OnlineCardController } from "@kaigilb/gilbplatformcode-online-card";
import type { PersonCard } from "@kaigilb/gilbplatformcode-person-connections";
import { ContactHeader, contactInitials, type ContactHeaderSlotImage } from "@kaigilb/gilbplatformcode-contact-header";
import { imageShapeOf } from "@kaigilb/gilbplatformcode-stakeholder-ui-kit";
import { useOnlineCardState } from "@kaigilb/gilbplatformcode-one-card";
import { placementChip } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { vaultLabel } from "@kaigilb/gilbplatformcode-vault-list";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { typeLocalName } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { ContactKindChip } from "./ContactKindChips";
import { PLACEMENT_CHIP_HELP } from "./PersonPlacementChips";
import { ContactKindChooser } from "./ContactKindChips";
import { GILBAPP_CHIP_HELP } from "./gilbappChipHelp";
import { useHeaderRelations } from "./useHeaderRelations";
import { useStakeholderContactHeaderHost } from "./stakeholderContactHeaderHost";

/**
 * The type the contact's image shape is read from: the first of the kind and its is-a ancestors that is a person, else the kind.
 * A kind under Person is a person; everything else (and an unknown kind) draws the rounded square. ⛔ Never from a name.
 */
export function contactImageType(kind: { kind: string; ancestors: readonly string[] } | null): string | null {
  if (!kind) return null;
  return [kind.kind, ...kind.ancestors].find((t) => imageShapeOf(t) === "circle") ?? kind.kind;
}

/** True when the vault the card is seen from is the signed-in holder's own ("Me"). */
export function isOwnVault(vault: Pick<ReachableVault, "vaultId" | "isLandingVault">, ownVaultId: string | null): boolean {
  return vault.isLandingVault || (!!ownVaultId && vault.vaultId.replace(/\/+$/, "") === ownVaultId.replace(/\/+$/, ""));
}

/** The holder's kind in words: "Me" for the holder's own vault, else its type's local name and "vault"; "Vault" when the type is not reported. */
export function holderCaption(vault: Pick<ReachableVault, "vaultId" | "represents" | "isLandingVault">, ownVaultId: string | null): string {
  if (isOwnVault(vault, ownVaultId)) return "Me";
  const local = vault.represents?.trim() ? typeLocalName(vault.represents.trim()) : "";
  return local ? `${local} vault` : "Vault";
}

/**
 * The holder's picture (the vault's own profile photo or logo) as an object URL, or null for initials. Read ONCE
 * per holder vault per session (React Query, kept for the session), ⛔ never again on the next card open. The holder is the same on
 * every card, so the old per-open `VaultAvatar` discovery is not used here.
 */
export function holderFaceKey(vaultId: string) {
  return ["s5b-holder-face", vaultId] as const;
}

/** Picture URL and the name on the owner's own card, from one cached discovery. */
interface HolderFaceCache {
  url: string | null;
  name: string | null;
}

function useHolderFaceCache(vault: ReachableVault | null | undefined): HolderFaceCache {
  const host = useStakeholderContactHeaderHost();
  const vaultId = vault?.vaultId ?? "";
  const q = useQuery({
    queryKey: holderFaceKey(vaultId),
    queryFn: async (): Promise<HolderFaceCache> => {
      if (!vault) return { url: null, name: null };
      const state = await host.discoverVaultProfilePhoto(vault.entity, vault.vaultId);
      const url = state.photoRef ? await host.loadPhotoObjectUrl(state.photoRef, vault.vaultId) : null;
      return { url, name: state.personName?.trim() || null };
    },
    enabled: !!vault?.vaultId,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return q.data ?? { url: null, name: null };
}

export function useHolderFace(vault: ReachableVault): string | null {
  return useHolderFaceCache(vault).url;
}

/** The name on the owner's own card, from the same cached face read as {@link useHolderFace}. Null when unknown. */
export function useHolderPersonName(vault: ReachableVault | null | undefined): string | null {
  return useHolderFaceCache(vault).name;
}

/** Person name when the self card has one, otherwise the vault's own label. */
export function holderPersonName(vault: ReachableVault, fromCard: string | null | undefined): string {
  const n = fromCard?.trim();
  return n || vaultLabel(vault);
}

/** The holder's image, drawn at the header's size and shape (read only: the vault's picture is changed where the vault is). */
export function HolderImage({ vault, image, initials }: { vault: ReachableVault; image: ContactHeaderSlotImage; initials: string }) {
  const face = useHolderFace(vault);
  return (
    <div
      data-testid="contact-header-holder-image"
      title={`${vaultLabel(vault)}: the vault this card is seen from`}
      style={{
        width: image.cssSize,
        height: image.cssSize,
        borderRadius: image.shape === "circle" ? "50%" : 16,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        background: "color-mix(in srgb, var(--accent) 9%, var(--paper))",
        outline: "1px solid color-mix(in srgb, var(--ink) 20%, transparent)",
      }}
    >
      {face ? (
        <img src={face} alt="" className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontFamily: '"Arial Narrow","Helvetica Neue","Roboto Condensed",Arial,sans-serif', fontSize: `calc(${image.cssSize} * 0.31)`, fontWeight: 700, color: "var(--accent)" }}>
          {initials}
        </span>
      )}
    </div>
  );
}

/** Their photo as an object URL, read with the holder's credential through the mediated, rung-gated route (once per viewer). */
function useTheirFace(principal: string | null, viewer: string | null): string | null {
  const host = useStakeholderContactHeaderHost();
  const q = useQuery({
    queryKey: ["s5b-their-face", viewer ?? "", principal ?? ""] as const,
    queryFn: () => host.loadGranteeFace(principal!, viewer),
    enabled: !!principal,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return principal ? (q.data ?? null) : null;
}

export interface StakeholderContactHeaderProps {
  /** The vault that holds the record: the side the card is seen from. */
  holderVault: ReachableVault;
  /** The signed-in holder's own vault (`ownVaultIdOf`). */
  ownVaultId: string | null;
  viewer: string | null;
  /** The signed-in principal (the kind labels' own read and write). */
  principal?: string | null;
  /** The holder may change this card: "+ Relation" is drawn (in his own vault only, as the body's "+ Kind"). */
  canEdit?: boolean;
  record: { id: string; entityUri: string | null; typeUri: string };
  /** The record's own name (its `a:name`), used when their card shares none. */
  ownName: string;
  /** The record's kind as the master serves it (kind IRI and its is-a ancestors). */
  kind: { kind: string; ancestors: readonly string[] } | null;
  /** The kind's label for the line under the name ("Person", "Organization"). */
  kindLabel: string;
  /** The resolver's answer (S3/S4), or null when not linked or not known yet. */
  personCard: PersonCard | null;
  /** The card's online card controller (a person card), or null. */
  /**
   * The record is the holder's OWN card. Then nothing about him "as a contact" is read or drawn: no Where / How we met
   * line, no relations or kinds of his own, and the caption says it is his own card.
   */
  ownCard?: boolean;
  onlineCard: OnlineCardController | null;
  /**
   * The record's own picture editor as the card has always drawn it (`VaultAvatar` in person or logo mode), or null when the card
   * has no picture field. Drawn when their card shares no photo.
   */
  ownPicture: ((image: ContactHeaderSlotImage, initials: string) => ReactNode) | null;
}

export function StakeholderContactHeader({
  holderVault,
  ownVaultId,
  viewer,
  principal = null,
  canEdit = false,
  record,
  ownName,
  kind,
  kindLabel,
  personCard,
  onlineCard,
  ownPicture,
  ownCard = false,
}: StakeholderContactHeaderProps) {
  const host = useStakeholderContactHeaderHost();
  const cardState = useOnlineCardState(onlineCard);
  const online = cardState?.online ?? null;
  const theirs = online?.status === "ready" ? online.card : null;
  const theirName = theirs ? cardName(theirs) : null;
  const theirFace = useTheirFace(theirs?.photoUrl ? theirs.principal : null, viewer);
  // Own card: with no record address the two reads below read nothing, so the own card costs no annotation or relation request.
  const aboutRecord = ownCard ? { ...record, entityUri: null } : record;
  // With the person the record is linked to, so a "Where / How we met" written elsewhere in the vault shows here too (the same read as the card's group).
  const origin = host.useHolderOriginLine({ vaultId: holderVault.vaultId, ownVaultId, recordEntityUri: aboutRecord.entityUri, linkedParty: personCard?.party ?? null,
    // Linked from the record's own link (`a:sameAs`, as the card controller and the person resolver read it), ⛔ not from
    // whether the person could be named.
    linked: (cardState?.link.state ?? "none") === "linked" || personCard?.link.state === "linked",
    linkedLookupFailed: !!personCard && !personCard.party,
    // A definite "not a person" answer keys the notes to the record (heldNoteKey).
    linkAnswer: personCard?.anchor?.kind ?? null,
  });
  // The little chain link is there when the contact is an online linked contact, and goes away when it is a local one.
  const linked = !!personCard && personCard.how !== "none";
  // A record that CARRIES a link whose card cannot be opened (the body says "cannot be opened from here now") is not
  // "your card only"; the caption says what the body says.
  const hasLink = (cardState?.link.state ?? "none") === "linked";
  // The chain-link badge shows whenever the record carries the link (`a:sameAs`), whatever the
  // reason their card cannot be read: the card read's 404, the resolver's 404, or a link to someone with no account. The link is still on
  // the record, and the body says the card cannot be opened.
  const badge = linked || hasLink;
  // The circles are the signed-in holder's own (read at his OWN vault, S4). Seen from a company or project vault they are ⛔ not that
  // vault's, so they are not drawn there (the connection line is read FOR the seen-from vault; whether such a
  // vault has circles of its own is an open decision).
  const placements = personCard?.how === "placement" && isOwnVault(holderVault, ownVaultId) ? personCard.placements : [];
  const displayName = (theirName ?? ownName).trim();
  const contact = {
    displayName,
    unnamed: displayName === "",
    photoUrl: theirFace,
    origin: origin.origin,
    originLoading: origin.loading,
    placements,
    placementOpen: false,
  };
  const holderName = holderPersonName(holderVault, useHolderPersonName(holderVault));
  const rel = useHeaderRelations({
    vaultId: holderVault.vaultId,
    vaultEntity: holderVault.entity,
    vaultRepresents: holderVault.represents,
    ownVaultId,
    principal,
    record: aboutRecord,
    canEdit: canEdit && !ownCard,
    contactName: displayName || ownName,
    holderName,
  });
  const relNote = rel.labels.actError;
  return (
    <>
    <ContactHeader
      relations={ownCard ? [] : rel.relations}
      {...(rel.canAdd && !ownCard ? { onAddRelation: rel.openChooser } : {})}
      layout="auto"
      contact={contact}
      linked={badge}
      holderInfo={{ name: holderName, caption: holderCaption(holderVault, ownVaultId), type: holderVault.represents }}
      holder={(image) => <HolderImage vault={holderVault} image={image} initials={contactInitials({ displayName: holderName, unnamed: false })} />}
      contactType={contactImageType(kind)}
      contactCaption={`${kindLabel}${ownCard ? " · your own card" : linked ? " · online card" : hasLink ? " · linked, not open to you now" : " · your card only"}`}
      renderPlacementChip={(p) => (
        <ContactKindChip
          chip={placementChip(p)}
          title={PLACEMENT_CHIP_HELP}
          meaning="access"
          testId="person-placement-chip"
          data={{ "data-context": p.context, "data-depth": p.depth }}
        />
      )}
      renderPhoto={(img) => <img src={img.src} alt={img.alt} className="h-full w-full object-cover" data-testid={img.testId} />}
      {...(!theirFace && ownPicture ? { photoEditor: (image: ContactHeaderSlotImage) => ownPicture(image, contactInitials(contact)) } : {})}
    />
    {relNote ? (
      <p role="status" data-testid="contact-header-relation-note" className="px-4 pt-1 text-right text-[11.5px]" style={{ color: "var(--ink-faint, inherit)" }}>
        {relNote}
      </p>
    ) : null}
    {rel.chooserOpen ? (
      <ContactKindChooser
        offered={rel.labels.offered}
        loading={rel.labels.offersLoading}
        help={GILBAPP_CHIP_HELP}
        note={rel.labels.catalogueNote}
        onClose={rel.closeChooser}
        onPick={(e) => {
          rel.closeChooser();
          void rel.labels.add(e);
        }}
      />
    ) : null}
    </>
  );
}
