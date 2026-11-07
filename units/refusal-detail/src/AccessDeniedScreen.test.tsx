import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AccessDeniedScreen, refusalLine } from "./index";

afterEach(cleanup);

describe("AccessDeniedScreen", () => {
  const detail = { method: "GET", path: "/lws/vault/x/records", status: 403, sentence: "vault target denied: no read reach" };

  // Ported from TestFlowerPower screens/batch8.test.tsx:8.
  test("shows method, path, status and the server sentence in a collapsed Details", () => {
    render(<AccessDeniedScreen onSignOut={() => {}} ownerName="Ann" detail={detail} />);
    const d = document.querySelector("details.refusal-details") as HTMLDetailsElement;
    expect(d.open).toBe(false);
    expect(screen.getByText("Details")).toBeTruthy();
    expect(d.textContent).toContain("GET /lws/vault/x/records -> HTTP 403 - vault target denied: no read reach");
  });

  // Ported from TestFlowerPower screens/batch5.test.tsx:35 (the screen's part).
  test("a place called garden: the private screen names the owner, shows no codes, and Sign out works", () => {
    const out = vi.fn();
    render(<AccessDeniedScreen onSignOut={out} ownerName="Ann" placeName="garden" />);
    expect(screen.getByText("This garden is private")).toBeTruthy();
    expect(screen.getByText("Ask its owner, Ann, to add you.")).toBeTruthy();
    expect(screen.queryByText(/403|Server says/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(out).toHaveBeenCalledTimes(1);
  });

  test("the default place is vault", () => {
    render(<AccessDeniedScreen onSignOut={() => {}} ownerName="Ben" />);
    expect(screen.getByText("This vault is private")).toBeTruthy();
    expect(screen.getByText("Ask its owner, Ben, to add you.")).toBeTruthy();
  });

  test("with no detail it says no request details were kept", () => {
    render(<AccessDeniedScreen onSignOut={() => {}} ownerName="Ann" />);
    expect(screen.getByText("No request details were kept for this refusal.")).toBeTruthy();
  });

  test("with no background props there is no bg-layer", () => {
    const { container } = render(<AccessDeniedScreen onSignOut={() => {}} ownerName="Ann" />);
    expect(container.querySelector(".bg-layer")).toBeNull();
  });

  test("with a background colour the bg-layer is drawn with that colour", () => {
    const { container } = render(<AccessDeniedScreen onSignOut={() => {}} ownerName="Ann" backgroundColor="rgb(207, 230, 244)" />);
    const layer = container.querySelector(".bg-layer") as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.style.backgroundColor).toBe("rgb(207, 230, 244)");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
  });

  test("with a background image the bg-layer uses it as url(...)", () => {
    const { container } = render(<AccessDeniedScreen onSignOut={() => {}} ownerName="Ann" backgroundImage="/bg/a.svg" />);
    const layer = container.querySelector(".bg-layer") as HTMLElement;
    expect(layer.style.backgroundImage).toBe('url("/bg/a.svg")');
  });

  test("the line the screen shows is refusalLine's", () => {
    render(<AccessDeniedScreen onSignOut={() => {}} ownerName="Ann" detail={{ ...detail, sentence: null }} />);
    expect(screen.getByText(refusalLine({ ...detail, sentence: null }))).toBeTruthy();
  });
});
