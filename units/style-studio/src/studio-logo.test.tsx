import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StyleStudio, sanitizeSvg } from "./studio/index";
import { svgToPngDataUrl } from "./studio/logo";

const HOSTILE = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="alert(1)"><script>alert(2)</script><foreignObject><iframe src="x"></iframe></foreignObject><rect width="40" height="20" fill="red" onclick="alert(3)"/></svg>`;
const PNG = "data:image/png;base64,iVBORw0KGgo=";

const blobs: Blob[] = [];
beforeEach(() => {
  blobs.length = 0;
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 1000;
    naturalHeight = 500;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => (blobs.push(b), "blob:test"), revokeObjectURL: () => {} }));
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: () => {} })) as never;
  HTMLCanvasElement.prototype.toDataURL = (() => PNG) as never;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const readBlob = (b: Blob) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsText(b);
  });

describe("sanitizeSvg", () => {
  it("removes script, handlers, foreignObject and iframe", () => {
    const out = sanitizeSvg(HOSTILE);
    expect(out).toContain("<rect");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onload/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).not.toMatch(/iframe/i);
    expect(out).not.toContain("alert");
  });

  it("rasterizes only the sanitized text, to a PNG data URL", async () => {
    const url = await svgToPngDataUrl(HOSTILE);
    expect(url.startsWith("data:image/png")).toBe(true);
    const sent = await readBlob(blobs[0]!);
    expect(sent).not.toMatch(/script|onload|onclick/i);
    expect(sent).toContain("xmlns");
  });

  it("refuses text with no svg in it", async () => {
    await expect(svgToPngDataUrl("<p>hi</p>")).rejects.toThrow();
  });
});

describe("logo tab", () => {
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it("rejects a 3 MB file with a message", async () => {
    render(<StyleStudio />);
    fireEvent.click(screen.getByRole("tab", { name: "Logo" }));
    const big = new File([new Uint8Array(3 * 1024 * 1024)], "big.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [big] } });
    expect(await screen.findByText(/larger than 2 MB/)).toBeTruthy();
    expect(screen.queryByAltText(/logo/)).toBeNull();
  });

  it("rejects an unsupported type", async () => {
    render(<StyleStudio />);
    fireEvent.click(screen.getByRole("tab", { name: "Logo" }));
    fireEvent.change(fileInput(), { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    expect(await screen.findByText(/PNG, JPEG, WebP or SVG/, { selector: "p[role=alert]" })).toBeTruthy();
  });

  it("stores an uploaded SVG only as a PNG data URL and shows it in the header", async () => {
    const onSave = vi.fn();
    render(<StyleStudio onSave={onSave} />);
    fireEvent.click(screen.getByRole("tab", { name: "Logo" }));
    fireEvent.change(fileInput(), { target: { files: [new File([HOSTILE], "logo.svg", { type: "image/svg+xml" })] } });
    const thumb = (await screen.findByAltText("Current primary logo")) as HTMLImageElement;
    expect(thumb.src.startsWith("data:image/png")).toBe(true);
    const header = screen.getByTestId("gs-preview").querySelector("header img") as HTMLImageElement;
    expect(header.src.startsWith("data:image/png")).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Save & export" }));
    fireEvent.click(screen.getByTestId("gs-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]![0];
    expect(saved.logo.primary.startsWith("data:image/png")).toBe(true);
    expect(JSON.stringify(saved)).not.toMatch(/svg/i);
  });

  it("keeps a small PNG as is and files it under the chosen role", async () => {
    render(<StyleStudio />);
    fireEvent.click(screen.getByRole("tab", { name: "Logo" }));
    fireEvent.change(screen.getByLabelText("This logo is the"), { target: { value: "favicon" } });
    fireEvent.change(fileInput(), { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], "f.png", { type: "image/png" })] } });
    const thumb = (await screen.findByAltText("Current favicon logo")) as HTMLImageElement;
    expect(thumb.src.startsWith("data:image/png;base64,")).toBe(true);
  });
});
