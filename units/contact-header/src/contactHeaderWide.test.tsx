// The `wide` layout of the shared ContactHeader.
// Holder image far left with its name and kind, the connection between (circle chips stacked one per line, the Where / How we met
// line), the contact's name RIGHT-justified and the contact image far right (128 px), the chain-link badge only when linked;
// a person is a circle, everything else a rounded square, by the type in the data.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AtomicPlacement } from "@kaigilb/gilbplatformcode-person-connections";
import {
  ContactHeader,
  type ContactHeaderContact,
  type ContactHeaderProps,
  type ContactHeaderSlotImage,
} from "./index";

afterEach(cleanup);

const PERSON: ContactHeaderContact = {
  displayName: "Ben Berg",
  unnamed: false,
  photoUrl: null,
  origin: null,
  originLoading: false,
  placements: [],
  placementOpen: false,
};

const chip = (p: AtomicPlacement) => <span data-testid="chip">{`${p.context}:${p.depth}`}</span>;

function draw(over: Partial<Omit<ContactHeaderProps, "contact">> & { contact?: Partial<ContactHeaderContact> } = {}) {
  const { contact, ...rest } = over;
  const props: ContactHeaderProps = {
    layout: "wide",
    linked: true,
    holder: <span data-testid="holder-img" />,
    holderInfo: { name: "Ann Berg", caption: "Me", type: "t:Person" },
    contactType: "t:Person",
    contactCaption: "Person · online card",
    renderPlacementChip: chip,
    renderPhoto: (img) => <img src={img.src} alt={img.alt} className={img.className} data-testid={img.testId} />,
    ...rest,
    contact: { ...PERSON, ...contact },
  };
  return render(<ContactHeader {...props} />);
}

describe("ContactHeader wide", () => {
  test("one row: holder image, holder name, the connection, the contact's name, the contact image (far right)", () => {
    draw();
    const header = screen.getByTestId("contact-shell-header");
    expect(header.getAttribute("data-layout")).toBe("wide");
    const row = screen.getByTestId("contact-shell-chrome-row");
    expect(Array.from(row.children).map((c) => c.getAttribute("data-testid"))).toEqual([
      "contact-header-holder",
      "contact-header-holder-name",
      "contact-header-connection",
      "contact-shell-identity",
      "contact-card-link-photo",
    ]);
    expect(screen.getByTestId("contact-header-holder").contains(screen.getByTestId("holder-img"))).toBe(true);
    expect(screen.getByTestId("contact-header-holder-name").textContent).toBe("Ann BergMe");
  });

  test("the contact's name is RIGHT-justified, with its caption under it", () => {
    draw();
    const ident = screen.getByTestId("contact-shell-identity");
    expect(ident.style.textAlign).toBe("right");
    expect(screen.getByTestId("contact-card-name").textContent).toBe("Ben Berg");
    expect(screen.getByTestId("contact-card-caption").textContent).toBe("Person · online card");
  });

  test("images are 128 px in wide (the slots are told so; the package's own box is sized by the stylesheet)", () => {
    const holder = vi.fn((_i: ContactHeaderSlotImage) => <span />);
    draw({ holder });
    expect(holder).toHaveBeenCalledWith({ shape: "circle", size: 128, cssSize: "128px" });
    expect(screen.getByTestId("contact-card-avatar").className).toBe("gsh-img");
    const sheet = document.querySelector('[data-testid="contact-shell-header"] style')!.textContent!.replace(/\s+/g, " ");
    expect(sheet).toContain('.gsh[data-layout="wide"] { --gsh-hold: 128px; --gsh-cont: 128px;');
    expect(sheet).toContain(".gsh-img { width: var(--gsh-cont); height: var(--gsh-cont);");
    expect(screen.getByTestId("contact-card-initials").textContent).toBe("BB");
  });

  describe("link badge only when linked to an online card", () => {
    test("linked: the badge, drawn as inline SVG (no icon font)", () => {
      draw({ linked: true });
      const badge = screen.getByTestId("contact-card-link-note");
      expect(badge.getAttribute("title")).toBe("Live link to their account — not a copy");
      expect(badge.querySelector("svg")).not.toBeNull();
      expect(badge.querySelector("i.fa")).toBeNull();
    });
    test("local only: no badge", () => {
      draw({ linked: false });
      expect(screen.queryByTestId("contact-card-link-note")).toBeNull();
    });
  });

  describe("shape by the type in the data", () => {
    test("person contact and person holder: circles", () => {
      draw();
      expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("circle");
      expect(screen.getByTestId("contact-header-holder").getAttribute("data-shape")).toBe("circle");
      expect(screen.getByTestId("contact-card-avatar").getAttribute("data-shape")).toBe("circle");
    });
    test("organization contact, project-vault holder: rounded squares", () => {
      draw({ contactType: "https://veda.example.test/base/t/Organization", holderInfo: { name: "Project One", caption: "Project vault", type: "t:Project" } });
      expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("rounded-square");
      expect(screen.getByTestId("contact-header-holder").getAttribute("data-shape")).toBe("rounded-square");
      expect(screen.getByTestId("contact-card-avatar").getAttribute("data-shape")).toBe("rounded-square");
    });
    test("unknown type: rounded square; a name is never a type", () => {
      draw({ contactType: null, holderInfo: { name: "Person", caption: null, type: undefined as unknown as null } });
      expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("rounded-square");
      expect(screen.getByTestId("contact-header-holder").getAttribute("data-shape")).toBe("rounded-square");
    });
    test("the app's image slots are handed the shape and the size", () => {
      const holder = vi.fn((_i: ContactHeaderSlotImage) => <span data-testid="holder-img" />);
      const editor = vi.fn((_i: ContactHeaderSlotImage) => <span data-testid="editor" />);
      draw({ holder, photoEditor: editor, contactType: "t:Organization" });
      expect(holder).toHaveBeenCalledWith({ shape: "circle", size: 128, cssSize: "128px" });
      expect(editor).toHaveBeenCalledWith({ shape: "rounded-square", size: 128, cssSize: "128px" });
      expect(screen.getByTestId("contact-card-link-photo").contains(screen.getByTestId("editor"))).toBe(true);
    });
  });

  describe("the connection between the two images", () => {
    test("circle chips stacked one per line, Inner collapsing 1st, read only when the app gives no panel", () => {
      draw({
        contact: {
          placements: [
            { context: "personal", depth: "first-degree" },
            { context: "personal", depth: "close-circle" },
            { context: "professional", depth: "close-circle" },
          ],
        },
      });
      const chips = screen.getByTestId("contact-card-placements");
      expect(chips.tagName).not.toBe("BUTTON");
      expect(chips.className).toBe("gsh-chips");
      expect(document.querySelector('[data-testid="contact-shell-header"] style')!.textContent!.replace(/\s+/g, " ")).toMatch(/\.gsh\[data-layout="wide"\] \.gsh-chips \{ flex-direction: column;/);
      expect(Array.from(chips.children).map((c) => c.textContent)).toEqual(["personal:close-circle", "professional:close-circle"]);
      expect(screen.getByTestId("contact-header-connection").contains(chips)).toBe(true);
      expect(screen.queryByTestId("contact-card-open-placement")).toBeNull();
    });
    test("read only and not placed: no chip at all (no 'Set connection type' that cannot be pressed)", () => {
      draw();
      expect(screen.queryByTestId("contact-card-placements")).toBeNull();
      expect(screen.queryByText("Set connection type")).toBeNull();
    });
    test("with a panel callback the chips are the button that opens it", () => {
      const onTogglePlacement = vi.fn();
      draw({ onTogglePlacement, contact: { placements: [{ context: "personal", depth: "first-degree" }] } });
      const button = screen.getByTestId("contact-card-open-placement");
      fireEvent.click(button);
      expect(onTogglePlacement).toHaveBeenCalledTimes(1);
      expect(button.getAttribute("aria-expanded")).toBe("false");
    });
    test("Where / How we met: present in the connection line", () => {
      draw({ contact: { origin: "at birth" } });
      const origin = screen.getByTestId("contact-card-origin-inline");
      expect(origin.textContent).toBe("at birth");
      expect(screen.getByTestId("contact-header-connection").contains(origin)).toBe(true);
    });
    test("Where / How we met: absent, and loading", () => {
      draw();
      expect(screen.queryByTestId("contact-card-origin-inline")).toBeNull();
      expect(screen.queryByText("Loading where you met…")).toBeNull();
      cleanup();
      draw({ contact: { originLoading: true } });
      expect(screen.getByText("Loading where you met…")).toBeTruthy();
    });
    test("nothing between the two sides: ONE line (arrow) from holder to contact, not two halves", () => {
      draw();
      expect(screen.getByTestId("contact-header-connection").children.length).toBe(1);
      cleanup();
      draw({ contact: { origin: "at birth" } });
      expect(screen.getByTestId("contact-header-connection").children.length).toBe(3);
    });
    test("no relations are drawn when none are given: no relation chip, no '+ Relation'", () => {
      draw({ contact: { origin: "at birth", placements: [{ context: "personal", depth: "first-degree" }] } });
      expect(screen.queryByText(/Relation/)).toBeNull();
      expect(screen.queryByTestId("contact-header-relations")).toBeNull();
    });
  });

  describe("the contact photo", () => {
    test("a photo with no onPhoto is shown, not a button", () => {
      draw({ contact: { photoUrl: "blob:their-photo" } });
      const avatar = screen.getByTestId("contact-card-avatar");
      expect(avatar.tagName).toBe("DIV");
      expect(screen.getByTestId("contact-card-photo").getAttribute("src")).toBe("blob:their-photo");
    });
    test("a photo with onPhoto is a button", () => {
      const onPhoto = vi.fn();
      draw({ onPhoto, contact: { photoUrl: "blob:p" } });
      const avatar = screen.getByTestId("contact-card-avatar");
      expect(avatar.tagName).toBe("BUTTON");
      fireEvent.click(avatar);
      expect(onPhoto).toHaveBeenCalledTimes(1);
    });
  });
});
