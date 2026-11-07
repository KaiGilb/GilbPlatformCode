import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

vi.mock("@kaigilb/gilbplatformcode-lws-session-bridge", () => ({
  dpopReadAuth: vi.fn(async () => ({ authorization: "DPoP t" })),
}));

import { SignedImage, forgetPictures } from "./index";

const ORIGIN = "https://example.test";
const ok = () => new Response(new Blob(["bytes"]), { status: 200 });
let fetchMock: ReturnType<typeof vi.fn>;
let n: number;
// A fetch that stays pending holds a queue slot, and the queue is module state shared by every test: let go of each at the end.
let held: Array<(r: Response) => void> = [];
const hang = () => new Promise<Response>((r) => held.push(r));

type IoRecord = { cb: (entries: { isIntersecting: boolean }[]) => void; options: IntersectionObserverInit | undefined; observed: Element[]; disconnect: ReturnType<typeof vi.fn> };
let ios: IoRecord[];
function installIo() {
  ios = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      rec: IoRecord;
      constructor(cb: IoRecord["cb"], options?: IntersectionObserverInit) {
        this.rec = { cb, options, observed: [], disconnect: vi.fn() };
        ios.push(this.rec);
      }
      observe(el: Element) {
        this.rec.observed.push(el);
      }
      disconnect() {
        this.rec.disconnect();
      }
    },
  );
}
function rectAt(top: number, bottom: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top, bottom, left: 0, right: 10, width: 10, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
}
const uri = () => `https://example.test/vault/e/pic-${++n}`;

beforeEach(() => {
  n = 0;
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => `blob:example.test/${++n}-url`) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});
afterEach(async () => {
  cleanup();
  for (const r of held) r(ok());
  held = [];
  await new Promise((r) => setTimeout(r, 5));
  forgetPictures();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("what is shown", () => {
  test("previewUrl wins and no fetch happens", async () => {
    const { container } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} previewUrl="data:image/png;base64,AAAA" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(container.firstElementChild!.getAttribute("data-state")).toBe("shown");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("a fetched picture is shown as an img, with data-state shown, default class thumb and empty alt", async () => {
    const { container } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toMatch(/^blob:example\.test\//);
    expect(img.getAttribute("alt")).toBe("");
    expect(container.firstElementChild!.className).toBe("thumb");
    expect(container.firstElementChild!.getAttribute("data-state")).toBe("shown");
    expect(fetchMock.mock.calls[0]![0]).toMatch(/^https:\/\/example\.test\/files\/pic-/);
  });
  test("className and alt are passed through", async () => {
    const { container } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} className="avatar" alt="Ann's picture" />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.firstElementChild!.className).toBe("avatar");
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("Ann's picture");
  });
  test("the placeholder shows while loading, with data-state loading", async () => {
    fetchMock.mockImplementation(() => hang());
    const { container } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} placeholder={<b data-testid="ph">wait</b>} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector("[data-testid=ph]")).not.toBeNull();
    expect(container.firstElementChild!.getAttribute("data-state")).toBe("loading");
    expect(container.querySelector(".signed-image-failed")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
  test("with no placeholder, nothing is drawn inside while loading", () => {
    fetchMock.mockImplementation(() => hang());
    const { container } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    expect(container.firstElementChild!.innerHTML).toBe("");
  });
  test("on failure: data-state failed, the placeholder, then the sentence", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 404 }));
    const { container } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} placeholder={<b data-testid="ph">wait</b>} />);
    await waitFor(() => expect(container.firstElementChild!.getAttribute("data-state")).toBe("failed"));
    const kids = [...container.firstElementChild!.children];
    expect(kids.map((k) => k.tagName)).toEqual(["B", "SPAN"]);
    expect(kids[1]!.className).toBe("signed-image-failed");
    expect(kids[1]!.textContent).toBe("This picture could not be loaded.");
    expect(container.querySelector("img")).toBeNull();
  });
  test("a previewUrl that arrives after the fetched picture wins over it", async () => {
    const f = uri();
    const { container, rerender } = render(<SignedImage fileUri={f} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")!.getAttribute("src")).toMatch(/^blob:/);
    rerender(<SignedImage fileUri={f} vaultOrigin={ORIGIN} previewUrl="data:image/png;base64,CCCC" />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("data:image/png;base64,CCCC");
  });
  test("five pictures at once: only four fetches run until one finishes", async () => {
    fetchMock.mockImplementation(() => hang());
    const releases = held;
    render(
      <>
        {[1, 2, 3, 4, 5].map((i) => (
          <SignedImage key={i} fileUri={`https://example.test/vault/e/many-${i}`} vaultOrigin={ORIGIN} />
        ))}
      </>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await act(async () => {
      releases[0]!(ok());
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    await act(async () => {
      releases.slice(1).forEach((r) => r(ok()));
    });
  });
  test("a failure with a previewUrl is not even tried: the preview shows", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 404 }));
    const { container } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} previewUrl="data:image/png;base64,BBBB" />);
    expect(container.firstElementChild!.getAttribute("data-state")).toBe("shown");
    expect(container.querySelector(".signed-image-failed")).toBeNull();
  });
  test("no file address and no preview: placeholder only, no fetch", async () => {
    const { container } = render(<SignedImage fileUri={null} vaultOrigin={ORIGIN} placeholder={<b data-testid="ph">x</b>} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=ph]")).not.toBeNull();
    expect(container.firstElementChild!.getAttribute("data-state")).toBe("loading");
  });
});

describe("when it fetches", () => {
  test("with IntersectionObserver missing it fetches at once, even far below the screen", async () => {
    rectAt(5000, 5100);
    expect(typeof IntersectionObserver).toBe("undefined");
    render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
  test("far below the screen it waits for the observer, with a 200px margin, and fetches when it intersects", async () => {
    installIo();
    rectAt(5000, 5100);
    const { container } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    expect(ios).toHaveLength(1);
    expect(ios[0]!.options).toEqual({ rootMargin: "200px" });
    expect(ios[0]!.observed).toEqual([container.firstElementChild]);
    await act(async () => {
      ios[0]!.cb([{ isIntersecting: false }]);
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ios[0]!.disconnect).not.toHaveBeenCalled();
    await act(async () => {
      ios[0]!.cb([{ isIntersecting: false }, { isIntersecting: true }]);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(ios[0]!.disconnect).toHaveBeenCalled();
    expect(ios).toHaveLength(1);
  });
  test("unmounting while it waits disconnects the observer", () => {
    installIo();
    rectAt(5000, 5100);
    const { unmount } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    unmount();
    expect(ios[0]!.disconnect).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("just below the screen (within 200px) it fetches without waiting for the observer", async () => {
    installIo();
    rectAt(window.innerHeight + 199, window.innerHeight + 300);
    render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(ios).toHaveLength(0);
  });
  test("200px or more below the screen it waits", async () => {
    installIo();
    rectAt(window.innerHeight + 200, window.innerHeight + 300);
    render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ios).toHaveLength(1);
  });
  test("just above the screen (within 200px) it fetches at once", async () => {
    installIo();
    rectAt(-300, -199);
    render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
  test("200px or more above the screen it waits", async () => {
    installIo();
    rectAt(-300, -200);
    render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a result that arrives too late", () => {
  test("unmounting before the picture arrives sets no state and logs no error", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockImplementation(() => hang());
    const { unmount } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    unmount();
    await act(async () => {
      held[0]!(ok());
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(errors).not.toHaveBeenCalled();
  });
  test("a picture that arrives for the file the component has since left is not shown", async () => {
    fetchMock.mockImplementation(() => hang());
    const releases = held;
    const a = uri();
    const b = uri();
    const { container, rerender } = render(<SignedImage fileUri={a} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender(<SignedImage fileUri={b} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      releases[0]!(ok());
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(container.querySelector("img")).toBeNull();
    await act(async () => {
      releases[1]!(ok());
    });
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
  });
  test("a failure that arrives for the file the component has since left is not shown", async () => {
    fetchMock.mockImplementation(() => hang());
    const releases = held;
    const { container, rerender } = render(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender(<SignedImage fileUri={uri()} vaultOrigin={ORIGIN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      releases[0]!(new Response("no", { status: 500 }));
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(container.firstElementChild!.getAttribute("data-state")).toBe("loading");
    expect(container.querySelector(".signed-image-failed")).toBeNull();
  });
});
