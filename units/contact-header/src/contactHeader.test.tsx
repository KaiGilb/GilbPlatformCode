// The shared contact header on its default layout, `narrow`. The open-panel ring is an inline box-shadow.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AtomicPlacement } from "@kaigilb/gilbplatformcode-person-connections";
import { ContactHeader, contactInitials, type ContactHeaderContact, type ContactHeaderProps } from "./index";

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

function chip(p: AtomicPlacement) {
  return <span data-testid="chip">{`${p.context}:${p.depth}`}</span>;
}

function draw(over: Partial<Omit<ContactHeaderProps, "contact">> & { contact?: Partial<ContactHeaderContact> } = {}) {
  const { contact, ...rest } = over;
  const props: ContactHeaderProps = {
    linked: true,
    holder: <span data-testid="holder" />,
    renderPlacementChip: chip,
    onTogglePlacement: () => {},
    renderPhoto: (img) => <img src={img.src} alt={img.alt} className={img.className} data-testid={img.testId} />,
    onPhoto: () => {},
    ...rest,
    contact: { ...PERSON, ...contact },
  };
  return render(<ContactHeader {...props} />);
}

describe("ContactHeader", () => {
  describe("placement chips", () => {
    test("a placed person shows one chip per context, in the button that opens the panel", () => {
      draw({
        contact: {
          placements: [
            { context: "personal", depth: "close-circle" },
            { context: "professional", depth: "first-degree" },
          ],
        },
      });
      const button = screen.getByTestId("contact-card-open-placement");
      const chips = screen.getAllByTestId("chip").map((c) => c.textContent);
      expect(chips).toEqual(["personal:close-circle", "professional:first-degree"]);
      expect(chips.every((_, i) => button.contains(screen.getAllByTestId("chip")[i]!))).toBe(true);
      expect(screen.queryByText("Set connection type")).toBeNull();
    });

    test("Inner supersedes 1st in the same context (the shared displayPlacements)", () => {
      draw({
        contact: {
          placements: [
            { context: "personal", depth: "first-degree" },
            { context: "personal", depth: "close-circle" },
          ],
        },
      });
      expect(screen.getAllByTestId("chip").map((c) => c.textContent)).toEqual(["personal:close-circle"]);
    });

    test("no placement shows the empty chip: person and group words", () => {
      draw();
      expect(screen.getByText("Set connection type")).toBeTruthy();
      cleanup();
      draw({ contact: { kind: "group" } });
      expect(screen.getByText("Set access")).toBeTruthy();
    });

    test("the placement button calls the panel callback and shows its open state", () => {
      const onTogglePlacement = vi.fn();
      draw({ onTogglePlacement, contact: { placementOpen: true } });
      const button = screen.getByTestId("contact-card-open-placement");
      fireEvent.click(button);
      expect(onTogglePlacement).toHaveBeenCalledTimes(1);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      // ⚠ jsdom drops a `color-mix()` value it cannot parse, so the ring's colour is not checked here; here
      // the open state is the button's aria-expanded, which is what the ring draws.
    });

    test("closed panel: no ring classes", () => {
      draw();
      const button = screen.getByTestId("contact-card-open-placement");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(button.getAttribute("style") ?? "").not.toMatch(/box-shadow/);
    });
  });

  describe("Where / How we met line", () => {
    test("present: shown under the name", () => {
      draw({ contact: { origin: "At birth" } });
      expect(screen.getByTestId("contact-card-origin-inline").textContent).toBe("At birth");
    });

    test("absent: no line, and no loading words", () => {
      draw();
      expect(screen.queryByTestId("contact-card-origin-inline")).toBeNull();
      expect(screen.queryByText("Loading where you met…")).toBeNull();
    });

    test("still loading: the loading words instead", () => {
      draw({ contact: { originLoading: true } });
      expect(screen.queryByTestId("contact-card-origin-inline")).toBeNull();
      expect(screen.getByText("Loading where you met…")).toBeTruthy();
    });
  });

  describe("live-link badge", () => {
    test("a linked contact has the badge", () => {
      draw({ linked: true });
      expect(screen.getByTestId("contact-card-link-note").getAttribute("title")).toBe(
        "Live link to their account — not a copy",
      );
    });

    test("a local-only contact has no badge", () => {
      draw({ linked: false });
      expect(screen.queryByTestId("contact-card-link-note")).toBeNull();
    });
  });

  describe("contact photo", () => {
    test("no photo: initials in the rounded square", () => {
      draw();
      expect(screen.getByTestId("contact-card-initials").textContent).toBe("BB");
      expect(screen.getByTestId("contact-card-avatar").getAttribute("data-has-photo")).toBe("false");
    });

    test("a photo: the app draws it inside a button that calls onPhoto", () => {
      const onPhoto = vi.fn();
      draw({ onPhoto, contact: { photoUrl: "https://x.example/p.jpg" } });
      const img = screen.getByTestId("contact-card-photo");
      expect(img.getAttribute("src")).toBe("https://x.example/p.jpg");
      expect(img.className).toBe("h-full w-full object-cover");
      const button = screen.getByTestId("contact-card-avatar");
      expect(button.getAttribute("aria-label")).toBe("View full-screen photo of Ben Berg");
      fireEvent.click(button);
      expect(onPhoto).toHaveBeenCalledTimes(1);
    });

    test("an editor slot replaces the photo button", () => {
      draw({ photoEditor: <span data-testid="editor" />, contact: { photoUrl: "https://x.example/p.jpg" } });
      expect(screen.getByTestId("editor")).toBeTruthy();
      expect(screen.queryByTestId("contact-card-photo")).toBeNull();
      expect(screen.getByTestId("contact-card-avatar").getAttribute("data-has-photo")).toBe("true");
    });
  });

  describe("the slots keep their order", () => {
    test("holder, then nav, then the connection and identity, then the photo; after comes after the row", () => {
      draw({ nav: <span data-testid="nav" />, after: <span data-testid="after" /> });
      const row = screen.getByTestId("contact-shell-chrome-row");
      const order = Array.from(row.children).map((c) => c.getAttribute("data-testid"));
      expect(order).toEqual([
        "contact-header-holder",
        "contact-header-holder-name",
        "contact-header-nav",
        "contact-header-connection",
        "contact-shell-identity",
        "contact-card-link-photo",
      ]);
      expect(screen.getByTestId("contact-header-holder").contains(screen.getByTestId("holder"))).toBe(true);
      expect(screen.getByTestId("contact-header-nav").contains(screen.getByTestId("nav"))).toBe(true);
      expect(row.nextElementSibling?.getAttribute("data-testid")).toBe("after");
    });
  });

  describe("contactInitials", () => {
    test("first and last word, one word, unnamed, empty", () => {
      expect(contactInitials({ displayName: "Ben  Berg", unnamed: false })).toBe("BB");
      expect(contactInitials({ displayName: "Ann Marie Lee", unnamed: false })).toBe("AL");
      expect(contactInitials({ displayName: "ann", unnamed: false })).toBe("AN");
      expect(contactInitials({ displayName: "Ben", unnamed: true })).toBe("?");
      expect(contactInitials({ displayName: "  ", unnamed: false })).toBe("?");
    });
  });
});
