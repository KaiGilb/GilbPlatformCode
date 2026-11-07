// What SignedImage asks pictureObjectUrl for, with the fetch layer replaced.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

vi.mock("./pictureUrl", () => ({
  pictureObjectUrl: vi.fn(async () => "blob:example.test/mock"),
  forgetPictures: vi.fn(),
}));

import { pictureObjectUrl } from "./pictureUrl";
import { SignedImage } from "./SignedImage";

afterEach(() => {
  cleanup();
  vi.mocked(pictureObjectUrl).mockClear();
});

describe("SignedImage arguments", () => {
  test("it asks for the file address and the vault origin it was given", async () => {
    render(<SignedImage fileUri="https://example.test/vault/e/pic-1" vaultOrigin="https://a.example.test" />);
    await waitFor(() => expect(pictureObjectUrl).toHaveBeenCalledTimes(1));
    expect(pictureObjectUrl).toHaveBeenCalledWith("https://example.test/vault/e/pic-1", "https://a.example.test");
  });
  test("a new vault origin asks again", async () => {
    const { rerender } = render(<SignedImage fileUri="https://example.test/vault/e/pic-1" vaultOrigin="https://a.example.test" />);
    await waitFor(() => expect(pictureObjectUrl).toHaveBeenCalledTimes(1));
    rerender(<SignedImage fileUri="https://example.test/vault/e/pic-1" vaultOrigin="https://b.example.test" />);
    await waitFor(() => expect(pictureObjectUrl).toHaveBeenCalledTimes(2));
    expect(pictureObjectUrl).toHaveBeenLastCalledWith("https://example.test/vault/e/pic-1", "https://b.example.test");
  });
});
