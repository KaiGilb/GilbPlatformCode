import { buildCopyMap } from "@kaigilb/gilbplatformcode-picture-set";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const seen: Array<{ fileUri: string | null; previewUrl?: string | null }> = [];
vi.mock("@kaigilb/gilbplatformcode-signed-picture", () => ({
  SignedImage: (p: { fileUri: string | null; previewUrl?: string | null; placeholder?: unknown }) => {
    seen.push({ fileUri: p.fileUri, previewUrl: p.previewUrl });
    return <span data-testid="img">{p.placeholder as never}</span>;
  },
}));

import { PictureThumb } from "./index";

const ORIGIN = "https://ann.example.test";
const MASTER = `${ORIGIN}/vault/e/master1`;
const THUMB = `${ORIGIN}/vault/e/thumb1`;
afterEach(() => {
  cleanup();
  seen.length = 0;
});

describe("PictureThumb", () => {
  it("a stored picture is a button named by the label; the image gets the small copy; a tap hands over the button", () => {
    const copies = buildCopyMap([
      { entityUri: MASTER, body: { fileByteSize: 500 } },
      { entityUri: THUMB, body: { fileByteSize: 50, transcodedFrom: MASTER } },
    ]);
    const onOpen = vi.fn();
    render(<PictureThumb stored={MASTER} copies={copies} vaultOrigin={ORIGIN} label="View picture of Heron" onOpen={onOpen} placeholder={<i>ph</i>} />);
    const btn = screen.getByRole("button", { name: "View picture of Heron" });
    expect(seen.at(-1)).toEqual({ fileUri: THUMB, previewUrl: null });
    expect(screen.getByText("ph")).toBeTruthy();
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]![0]).toBe(btn);
  });
  it("while the copy map is not listed yet the picture waits (no address) but can already be opened", () => {
    const onOpen = vi.fn();
    render(<PictureThumb stored={MASTER} copies={null} vaultOrigin={ORIGIN} label="Open" onOpen={onOpen} />);
    expect(seen.at(-1)!.fileUri).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it("a local preview wins and is a button too", () => {
    render(<PictureThumb stored={null} previewUrl="blob:p" copies={null} vaultOrigin={ORIGIN} label="Open" onOpen={() => undefined} />);
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
    expect(seen.at(-1)).toEqual({ fileUri: null, previewUrl: "blob:p" });
  });
  it("no picture: the placeholder in a box that is not a button, and nothing can open", () => {
    const onOpen = vi.fn();
    const { container } = render(<PictureThumb stored={null} copies={null} vaultOrigin={ORIGIN} label="Open" onOpen={onOpen} placeholder={<i>ph</i>} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".thumb--empty")?.textContent).toBe("ph");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
