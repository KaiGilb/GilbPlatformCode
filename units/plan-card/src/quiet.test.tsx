// The quiet "+ Add" panel of a line in view mode: it opens from the line's "+ Add", and closes on Escape or a press outside the card's
// group, but not while a dialog opened from it is up.
import { afterEach, describe, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openPortalRoots } from "@kaigilb/gilbplatformcode-open-popups";
import { makeApp, mountCard } from "../test/app";
import { settle } from "../test/helpers";

afterEach(() => document.querySelectorAll("[data-test-layer]").forEach((e) => e.remove()));


describe("the quiet panel of the Authority line", () => {
  // In view mode an empty line is not drawn; a line with something in it is, with a "+ Add" beside its title.
  async function openAuthority() {
    const app = makeApp({ relations: { fn1: [{ relation: "t:AuthorityOf", uri: "https://h.example.test/base/e/ann", label: "Ann Co" } as never] } });
    mountCard(app, app.seed("fn1", "t:Function", { unitTag: "A.B", authority: "Ann" }), { mode: "view" });
    await settle();
    const user = userEvent.setup();
    const group = document.querySelector('[data-group="plan-authority"]') as HTMLElement;
    await user.click(within(group).getByRole("button", { name: "+ Add" }));
    return { app, user, group };
  }

  test("opens from + Add, with the line's source box", async () => {
    await openAuthority();
    expect(screen.getByLabelText("Authority source")).toBeTruthy();
  });

  test("closes on Escape", async () => {
    const { user } = await openAuthority();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Authority source")).toBeNull();
  });

  test("closes on a press outside the group, not inside it", async () => {
    const { group } = await openAuthority();
    fireEvent.mouseDown(group.querySelector("h3")!);
    expect(screen.getByLabelText("Authority source")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText("Authority source")).toBeNull();
  });

  test("a press inside a dialog layer is not a press outside", async () => {
    await openAuthority();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("data-test-layer", "");
    dialog.innerHTML = '<button type="button">Inside the dialog</button>';
    document.body.appendChild(dialog);
    fireEvent.mouseDown(dialog.querySelector("button")!);
    expect(screen.getByLabelText("Authority source")).toBeTruthy();
  });

  test("while the host's create dialog is open, neither Escape nor a press anywhere closes it", async () => {
    const { user } = await openAuthority();
    const root = document.createElement("div");
    openPortalRoots.push(root);
    try {
      await user.keyboard("{Escape}");
      fireEvent.mouseDown(document.body);
      expect(screen.getByLabelText("Authority source")).toBeTruthy();
    } finally {
      openPortalRoots.splice(openPortalRoots.indexOf(root), 1);
    }
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText("Authority source")).toBeNull();
  });
});
