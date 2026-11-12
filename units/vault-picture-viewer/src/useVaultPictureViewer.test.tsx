import { createFakePlatform, type FakeFile, type FakePlatform } from "@kaigilb/gilbplatformcode-fake-platform";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { buildCopyMap, type CopyMap } from "@kaigilb/gilbplatformcode-picture-set";
import { forgetPictures } from "@kaigilb/gilbplatformcode-signed-picture";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVaultPictureViewer, type VaultPictureViewer, type VaultPictureViewerOptions } from "./index";

// The real signed-picture and picture-set run against the fake platform, signed through setLwsAuth.
const ORIGIN = "https://ann.fake.test";
const bytes = (n: number): Uint8Array => new Uint8Array(n).fill(7);
const SIZES = { master: 500, thumb: 50, large: 2000 };

let fake: FakePlatform;
let master: FakeFile, thumb: FakeFile, large: FakeFile;
const uri = (f: FakeFile): string => `${ORIGIN}/vault/e/${f.id}`;
let copies: CopyMap;
let api: VaultPictureViewer;

function Harness(p: { options: VaultPictureViewerOptions }) {
  api = useVaultPictureViewer(p.options);
  return <div>{api.viewer}</div>;
}
const options = (o: Partial<VaultPictureViewerOptions> = {}): VaultPictureViewerOptions => ({ vaultOrigin: ORIGIN, copies, ...o });
const mount = (o: Partial<VaultPictureViewerOptions> = {}) => render(<Harness options={options(o)} />);
const filePaths = (): string[] => fake.calls.all.filter((c) => c.method === "GET" && c.path.startsWith("/files/")).map((c) => c.path);
const openStored = async (m: string, extra: { el?: HTMLElement | null; caption?: string; alt?: string } = {}) => { await act(async () => { await api.openStored({ master: m, alt: "Ann at the lake", ...extra }); }); };
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-lightbox-viewer]");
const imgs = (): HTMLImageElement[] => [...document.querySelectorAll<HTMLImageElement>("[data-lightbox-viewer] img")];
const mainImg = (): HTMLImageElement | undefined => imgs().find((i) => !i.classList.contains("ilb-img-thumb"));

beforeEach(() => {
  fake = createFakePlatform();
  const ann = fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
  const v = fake.state.vaults.get(ann.landingVaultId!)!;
  master = fake.seedFile(v, { name: "lake.jpg", bytes: bytes(SIZES.master), mediaType: "image/jpeg", type: "ImageFile" });
  thumb = fake.seedFile(v, { name: "lake-320.jpg", bytes: bytes(SIZES.thumb), mediaType: "image/jpeg", type: "ImageFile", transcodedFrom: master });
  large = fake.seedFile(v, { name: "lake-big.jpg", bytes: bytes(SIZES.large), mediaType: "image/jpeg", type: "ImageFile", transcodedFrom: master });
  const row = (f: FakeFile, size: number, from?: FakeFile) => ({ entityUri: uri(f), body: { fileByteSize: size, ...(from ? { transcodedFrom: uri(from) } : {}) } });
  copies = buildCopyMap([row(master, SIZES.master), row(thumb, SIZES.thumb, master), row(large, SIZES.large, master)]);
  setBaseOrigin(fake.origin); // the credential goes only to the platform's own hosts
  setLwsAuth(fake.authHost(ann) as never);
  vi.stubGlobal("fetch", fake.fetch);
  // An object URL names the size of the bytes it holds, so a test can tell which file is on screen.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom has none; the viewer locks page scroll
  URL.createObjectURL = ((b: Blob) => `blob:test/${b.size}`) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
});
afterEach(() => {
  cleanup();
  forgetPictures();
  resetLwsAuth();
  resetBaseOrigin();
  vi.unstubAllGlobals();
});

describe("useVaultPictureViewer", () => {
  it("openStored fetches the thumbnail first, then the largest copy, and the large copy ends up on screen", async () => {
    mount();
    await openStored(uri(master));
    await flush();
    expect(filePaths()).toEqual([`/files/${thumb.id}`, `/files/${large.id}`]);
    expect(dialog()).not.toBeNull();
    expect(mainImg()!.getAttribute("src")).toBe(`blob:test/${SIZES.large}`);
    expect(fake.calls.all.map((c) => c.status)).toEqual([200, 200]); // both reads were signed and answered
    expect(fake.violations).toEqual([]);
  });

  it("the thumbnail is the stand-in while the large copy is still coming", async () => {
    mount();
    const release = fake.hold(`GET /files/${large.id}`);
    await openStored(uri(master));
    await flush();
    expect(imgs().find((i) => i.classList.contains("ilb-img-thumb"))!.getAttribute("src")).toBe(`blob:test/${SIZES.thumb}`);
    await act(async () => { release(); });
    await flush();
    expect(mainImg()!.getAttribute("src")).toBe(`blob:test/${SIZES.large}`);
  });

  it("a thumbnail that cannot be read does not stop the viewer: it opens without a stand-in and shows the large copy", async () => {
    mount();
    fake.failNext(`GET /files/${thumb.id}`, { status: 500 });
    await openStored(uri(master));
    await flush();
    expect(dialog()).not.toBeNull();
    expect(imgs().some((i) => i.classList.contains("ilb-img-thumb"))).toBe(false);
    expect(mainImg()!.getAttribute("src")).toBe(`blob:test/${SIZES.large}`);
  });

  it("a master the map does not list is fetched itself (thumb and large are the same address: one fetch), and so is any master while copies is null", async () => {
    const other = fake.seedFile(fake.state.vaults.get(master.vaultId)!, { name: "alone.jpg", bytes: bytes(333), mediaType: "image/jpeg", type: "ImageFile" });
    mount();
    await openStored(uri(other));
    await flush();
    expect(filePaths()).toEqual([`/files/${other.id}`]);
    expect(mainImg()!.getAttribute("src")).toBe("blob:test/333");
    cleanup();
    forgetPictures();
    fake.calls.clear();
    mount({ copies: null });
    await openStored(uri(master));
    await flush();
    expect(filePaths()).toEqual([`/files/${master.id}`]);
    expect(mainImg()!.getAttribute("src")).toBe(`blob:test/${SIZES.master}`);
  });

  it("thumbUri is the smallest copy, the master for a master the map does not list, and null while copies is null", () => {
    mount();
    expect(api.thumbUri(uri(master))).toBe(uri(thumb));
    expect(api.thumbUri(`${ORIGIN}/vault/e/unknown-file`)).toBe(`${ORIGIN}/vault/e/unknown-file`);
    cleanup();
    mount({ copies: null });
    expect(api.thumbUri(uri(master))).toBeNull();
  });

  it("a refused read of the large copy shows the viewer's own loadFailed words", async () => {
    mount();
    fake.failNext(`GET /files/${large.id}`, { status: 403 });
    await openStored(uri(master));
    await flush();
    expect(dialog()!.textContent).toContain("The picture could not be loaded");
  });

  it("a refused read shows the words you passed", async () => {
    mount({ words: { loadFailed: "Kunne ikke vise bildet" } });
    fake.failNext(`GET /files/${large.id}`, { status: 403 });
    await openStored(uri(master));
    await flush();
    expect(dialog()!.textContent).toContain("Kunne ikke vise bildet");
    expect(dialog()!.textContent).not.toContain("The picture could not be loaded");
  });

  it("openLocal makes no network call at all and shows the local URL", async () => {
    mount();
    act(() => { api.openLocal({ url: "blob:local/just-picked", alt: "Just picked" }); });
    await flush();
    expect(fake.calls.count()).toBe(0);
    expect(mainImg()!.getAttribute("src")).toBe("blob:local/just-picked");
    expect(mainImg()!.getAttribute("alt")).toBe("Just picked");
  });

  const caption = (): string | undefined => document.querySelector("[data-lightbox-viewer] figcaption")?.textContent ?? undefined;

  it("openStored shows the caption it was given, and the alt text when it was given none", async () => {
    mount();
    await openStored(uri(master), { caption: "Fern on the sill", alt: "A fern" });
    await flush();
    expect(caption()).toBe("Fern on the sill");
    cleanup();
    mount();
    await openStored(uri(master), { alt: "A fern" });
    await flush();
    expect(caption()).toBe("A fern");
  });

  it("openLocal shows the caption it was given, and the alt text when it was given none", async () => {
    mount();
    act(() => { api.openLocal({ url: "blob:local/x", alt: "A fern", caption: "Fern on the sill" }); });
    await flush();
    expect(caption()).toBe("Fern on the sill");
    cleanup();
    mount();
    act(() => { api.openLocal({ url: "blob:local/x", alt: "A fern" }); });
    await flush();
    expect(caption()).toBe("A fern");
  });

  it("closing the viewer gives focus to the element openStored was given as el when nothing on the page had focus at open", async () => {
    // picture-viewer's hook returns focus to the element that had it at open, after the viewer has given it to `el`; so `el` decides
    // only when nothing (the body) had focus then, which is what this test sets up.
    render(<><button id="b">b</button><Harness options={options()} /></>);
    const b = document.getElementById("b")!;
    expect(document.activeElement).toBe(document.body);
    await openStored(uri(master), { el: b });
    await flush();
    expect(dialog()).not.toBeNull();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    await flush();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(b);
  });
});
