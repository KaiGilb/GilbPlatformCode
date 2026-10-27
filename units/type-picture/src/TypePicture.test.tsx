import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TypePicture, TypePictureSourceContext, createTypePictureSource, useTypePicture, useTypePictureSrc } from "./index";
import type { TypePictureSource } from "./index";

afterEach(cleanup);

const stub = (map: Record<string, string | null>): TypePictureSource & { fetchTypePictureSrc: ReturnType<typeof vi.fn> } =>
  ({ fetchTypePictureSrc: vi.fn(async (name: string) => map[name] ?? null) }) as never;
const withSource = (source: TypePictureSource | null) => ({ children }: { children: ReactNode }) => (
  <TypePictureSourceContext.Provider value={source}>{children}</TypePictureSourceContext.Provider>
);
const draw = (source: TypePictureSource | null, ui: ReactNode) => render(ui, { wrapper: withSource(source) });

describe("TypePicture", () => {
  it("draws nothing without a provider, however good the name", async () => {
    const { container } = render(<TypePicture typeName="Chair" px={20} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("draws nothing while the picture is loading", () => {
    const pending = { fetchTypePictureSrc: vi.fn(() => new Promise<string | null>(() => {})) } as unknown as TypePictureSource;
    const { container } = draw(pending, <TypePicture typeName="Chair" px={20} />);
    expect(container.innerHTML).toBe("");
  });

  it("draws an <img> once loaded: no alt, hidden from assistive tech, async decoding, px size, exact classes", async () => {
    const source = stub({ Chair: "https://files.example.test/files/chair" });
    const { container } = draw(source, <TypePicture typeName="Chair" px={20} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://files.example.test/files/chair");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("width")).toBe("20");
    expect(img.getAttribute("height")).toBe("20");
    expect(img.style.width).toBe("20px");
    expect(img.style.height).toBe("20px");
    expect(img.getAttribute("data-type-picture")).toBe("Chair");
    expect(img.getAttribute("class")).toBe("inline-block shrink-0 object-contain align-middle ");
    expect(container.childNodes).toHaveLength(1);
  });

  it("adds the caller's class after the fixed ones", async () => {
    const { container } = draw(stub({ Chair: "https://files.example.test/files/chair" }), <TypePicture typeName="Chair" px={32} className="ml-1" />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")!.getAttribute("class")).toBe("inline-block shrink-0 object-contain align-middle ml-1");
    expect(container.querySelector("img")!.style.width).toBe("32px");
  });

  it("reads the type by its bare name, whatever the spelling it was given", async () => {
    const source = stub({ Chair: "https://files.example.test/files/chair" });
    const { container } = draw(source, <TypePicture typeName="https://vault.example.test/base/t/Chair" px={20} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(source.fetchTypePictureSrc).toHaveBeenCalledWith("Chair");
    expect(container.querySelector("img")!.getAttribute("data-type-picture")).toBe("Chair");
  });

  it("no type, an empty name or a name that is not a type name: nothing, and no ask", async () => {
    const source = stub({ Chair: "https://files.example.test/files/chair" });
    for (const name of [null, undefined, "", "   ", "a/b"]) {
      const { container, unmount } = draw(source, <TypePicture typeName={name} px={20} />);
      await new Promise((r) => setTimeout(r, 10));
      expect(container.innerHTML, String(name)).toBe("");
      unmount();
    }
    expect(source.fetchTypePictureSrc).not.toHaveBeenCalled();
  });

  it("a type with no picture draws nothing", async () => {
    const source = stub({});
    const { container } = draw(source, <TypePicture typeName="Chair" px={20} />);
    await waitFor(() => expect(source.fetchTypePictureSrc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(container.innerHTML).toBe("");
  });

  it("a picture that fails to load draws nothing", async () => {
    const { container } = draw(stub({ Chair: "https://files.example.test/files/gone" }), <TypePicture typeName="Chair" px={20} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    fireEvent.error(container.querySelector("img")!);
    await waitFor(() => expect(container.querySelector("img")).toBeNull());
    expect(container.innerHTML).toBe("");
  });

  it("the failure is forgotten when the type name changes, even to a type with the same picture address", async () => {
    const same = "https://files.example.test/files/shared";
    const source = stub({ Chair: same, Table: same });
    const { container, rerender } = render(<TypePicture typeName="Chair" px={20} />, { wrapper: withSource(source) });
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    fireEvent.error(container.querySelector("img")!);
    await waitFor(() => expect(container.querySelector("img")).toBeNull());
    rerender(<TypePicture typeName="Table" px={20} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")!.getAttribute("data-type-picture")).toBe("Table");
  });

  it("a failure stays while the same type is drawn again with new props", async () => {
    const source = stub({ Chair: "https://files.example.test/files/gone" });
    const { container, rerender } = render(<TypePicture typeName="Chair" px={20} />, { wrapper: withSource(source) });
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    fireEvent.error(container.querySelector("img")!);
    await waitFor(() => expect(container.querySelector("img")).toBeNull());
    rerender(<TypePicture typeName="Chair" px={24} className="x" />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector("img")).toBeNull();
  });

  it("the picture follows the type name", async () => {
    const source = stub({ Chair: "https://files.example.test/files/chair", Table: "https://files.example.test/files/table" });
    const { container, rerender } = render(<TypePicture typeName="Chair" px={20} />, { wrapper: withSource(source) });
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("https://files.example.test/files/chair"));
    rerender(<TypePicture typeName="Table" px={20} />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("https://files.example.test/files/table"));
    rerender(<TypePicture typeName={null} px={20} />);
    await waitFor(() => expect(container.querySelector("img")).toBeNull());
  });

  it("works with a real source: the picture is read from the type's document", async () => {
    const fetchStub = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ "a:typePicture": { "@id": "https://vault.example.test/base/e/pic1" } }) }) as unknown as Response);
    const source = createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: () => "https://files.example.test", fetch: fetchStub as unknown as typeof fetch });
    const { container } = draw(source, <TypePicture typeName="Chair" px={20} />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("https://files.example.test/files/pic1"));
    expect(fetchStub).toHaveBeenCalledWith("https://ontology.example.test/base/t/Chair", { headers: { accept: "application/json" } });
  });
});

describe("useTypePictureSrc", () => {
  it("is null with no provider, and with a provider that holds null", () => {
    expect(renderHook(() => useTypePictureSrc("Chair")).result.current).toBeNull();
    expect(renderHook(() => useTypePictureSrc("Chair"), { wrapper: withSource(null) }).result.current).toBeNull();
  });
  it("is null while loading and the address once loaded", async () => {
    const source = stub({ Chair: "https://files.example.test/files/chair" });
    const { result } = renderHook(() => useTypePictureSrc("Chair"), { wrapper: withSource(source) });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe("https://files.example.test/files/chair"));
  });
  it("asks again when the source changes", async () => {
    const one = stub({ Chair: "https://files.example.test/files/one" });
    const two = stub({ Chair: "https://files.example.test/files/two" });
    let current: TypePictureSource = one;
    const wrapper = ({ children }: { children: ReactNode }) => <TypePictureSourceContext.Provider value={current}>{children}</TypePictureSourceContext.Provider>;
    const { result, rerender } = renderHook(() => useTypePictureSrc("Chair"), { wrapper });
    await waitFor(() => expect(result.current).toBe("https://files.example.test/files/one"));
    current = two;
    rerender();
    await waitFor(() => expect(result.current).toBe("https://files.example.test/files/two"));
    expect(two.fetchTypePictureSrc).toHaveBeenCalledWith("Chair");
  });
  it("an answer that arrives after the component is gone is dropped", async () => {
    let resolve!: (v: string | null) => void;
    const source = { fetchTypePictureSrc: vi.fn(() => new Promise<string | null>((r) => (resolve = r))) } as unknown as TypePictureSource;
    const { result, unmount } = renderHook(() => useTypePictureSrc("Chair"), { wrapper: withSource(source) });
    unmount();
    await act(async () => resolve("https://files.example.test/files/late"));
    expect(result.current).toBeNull();
  });
});

describe("useTypePicture", () => {
  it("gives the address, and fail() takes it away", async () => {
    const source = stub({ Chair: "https://files.example.test/files/chair" });
    const { result } = renderHook(() => useTypePicture("t:Chair"), { wrapper: withSource(source) });
    expect(result.current.src).toBeNull();
    await waitFor(() => expect(result.current.src).toBe("https://files.example.test/files/chair"));
    act(() => result.current.fail());
    expect(result.current.src).toBeNull();
  });
});
