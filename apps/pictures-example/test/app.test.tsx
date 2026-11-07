import { StrictMode } from "react";
import { describe, expect, test } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { file, fakeSet, newEngine, setup } from "./helpers";

function seedThree(vault: ReturnType<typeof setup>) {
  for (let i = 1; i <= 3; i++) vault.seed(`s${i}`, new Uint8Array(100 * i), new Uint8Array(10 * i));
}

describe("App", () => {
  test("the grid shows the stored pictures through SignedImage, newest first, with no non-local request", async () => {
    const vault = setup();
    seedThree(vault);
    const engine = newEngine(vault, async () => fakeSet());
    render(<App engine={engine} onSignOut={() => undefined} />);
    await engine.start();
    const grid = await screen.findByRole("list", { name: "Pictures" });
    await waitFor(() => expect(within(grid).getAllByRole("img")).toHaveLength(3));
    // three thumbnails were fetched by address, the signed way
    expect(vault.requests.filter((r) => r.startsWith("GET /files/"))).toHaveLength(3);
    expect(vault.violations).toEqual([]);
  });

  test("under StrictMode (effect, cleanup, effect again) the grid still loads", async () => {
    const vault = setup();
    seedThree(vault);
    const engine = newEngine(vault, async () => fakeSet());
    const { useEffect } = await import("react");
    function Host() {
      useEffect(() => {
        void engine.start();
        return () => engine.dispose();
      }, []);
      return <App engine={engine} onSignOut={() => undefined} />;
    }
    render(
      <StrictMode>
        <Host />
      </StrictMode>,
    );
    const grid = await screen.findByRole("list", { name: "Pictures" });
    await waitFor(() => expect(within(grid).getAllByRole("img")).toHaveLength(3));
  });

  test("the empty grid says what to do", async () => {
    const vault = setup();
    const engine = newEngine(vault, async () => fakeSet());
    render(<App engine={engine} onSignOut={() => undefined} />);
    await engine.start();
    expect(await screen.findByTestId("empty")).toBeTruthy();
    expect(screen.getByText("Take photo")).toBeTruthy();
    expect(screen.getByText("Choose photos")).toBeTruthy();
  });

  test("choosing a picture shows it at once as Saving…, then stored in the vault", async () => {
    const vault = setup();
    const engine = newEngine(vault, async () => fakeSet());
    render(<App engine={engine} onSignOut={() => undefined} />);
    await engine.start();
    const input = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    await userEvent.upload(input, file("new.jpg"));
    await waitFor(() => expect(document.querySelectorAll("[data-tile]")).toHaveLength(1));
    await waitFor(() => expect(vault.uploads.length).toBe(3));
    await waitFor(() => expect(document.querySelector("[data-status]")?.getAttribute("data-status")).toBe("stored"));
    expect(screen.queryByText("Saving…")).toBeNull();
  });

  test("a refused listing shows the access-denied screen with the server's line", async () => {
    const vault = setup();
    vault.refuseList = "vault target denied: no read reach";
    const engine = newEngine(vault, async () => fakeSet());
    render(<App engine={engine} onSignOut={() => undefined} />);
    await engine.start();
    expect(await screen.findByText(/is private/)).toBeTruthy();
    expect(document.querySelector(".refusal-details")?.textContent).toContain("GET");
    expect(document.querySelector(".refusal-details")?.textContent).toContain("HTTP 403 - vault target denied: no read reach");
  });

  test("the viewer opens on the picture that was tapped, shows the largest stored copy, and closes with Escape", async () => {
    const vault = setup();
    seedThree(vault);
    const engine = newEngine(vault, async () => fakeSet());
    render(<App engine={engine} onSignOut={() => undefined} />);
    await engine.start();
    const tiles = await screen.findAllByRole("button", { name: /Open picture/ });
    expect(tiles).toHaveLength(3);
    await userEvent.click(tiles[1]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Picture 2 of 3/)).toBeTruthy();
    // the master (not the small copy) is fetched for the big view: s2 master is 200 bytes
    const master2 = vault.files.find((f) => f.name === "s2.jpg")!;
    await waitFor(() => expect(vault.requests).toContain(`GET /files/${master2.id}`));
    expect(vault.requests).not.toContain(`GET /files/${vault.files.find((f) => f.name === "s1.jpg")!.id}`); // the other pictures' masters are not fetched
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("sign out is offered", async () => {
    const vault = setup();
    const engine = newEngine(vault, async () => fakeSet());
    let out = 0;
    render(<App engine={engine} onSignOut={() => void out++} />);
    await engine.start();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(out).toBe(1);
  });
});
