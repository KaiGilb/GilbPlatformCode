import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EntityRefValue, RefLabelContext, isEntityRefValue } from "./index";
import type { UseRefLabel } from "./index";

afterEach(cleanup);

const REF = "https://geo.example.test/base/e/osm-r-59470";
const withLabel = (hook: UseRefLabel, ui: React.ReactNode) => render(<RefLabelContext.Provider value={hook}>{ui}</RefLabelContext.Provider>);

describe("EntityRefValue", () => {
  it("shows … while the host's hook says null, and keeps the address under it", () => {
    const { container } = withLabel(() => null, <EntityRefValue value={REF} vaultId="v1" />);
    const spans = container.querySelectorAll("span");
    expect(container.textContent).toBe(`…${REF}`);
    expect(spans.length).toBe(3);
  });

  it("with onOpen, the name is a button titled with the stored value, and a click opens the id", () => {
    const onOpen = vi.fn();
    withLabel(() => "Paraguay", <EntityRefValue value={REF} vaultId="v1" onOpen={onOpen} />);
    const b = screen.getByRole("button", { name: "Paraguay" });
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("title")).toBe(REF);
    fireEvent.click(b);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("osm-r-59470");
  });

  it("the … is the button's text while loading", () => {
    withLabel(() => null, <EntityRefValue value={REF} vaultId="v1" onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "…" })).toBeTruthy();
  });

  it("without onOpen, the name is a plain span titled with the value, and there is no button", () => {
    const { container } = withLabel(() => "Paraguay", <EntityRefValue value={REF} vaultId="v1" />);
    expect(screen.queryByRole("button")).toBeNull();
    const named = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "Paraguay")!;
    expect(named.getAttribute("title")).toBe(REF);
  });

  it("draws the stored address on a second line, titled with itself; quiet hides it", () => {
    const loud = withLabel(() => "Paraguay", <EntityRefValue value={REF} vaultId="v1" />);
    const second = Array.from(loud.container.querySelectorAll("span")).filter((s) => s.textContent === REF);
    expect(second).toHaveLength(1);
    expect(second[0]!.getAttribute("title")).toBe(REF);
    expect(second[0]!.className).toContain("text-[11px]");
    cleanup();
    const quiet = withLabel(() => "Paraguay", <EntityRefValue value={REF} vaultId="v1" quiet />);
    expect(quiet.container.textContent).toBe("Paraguay");
  });

  it("asks the hook for the parsed reference and the vault, once per render, even for a value that is not a reference", () => {
    const hook = vi.fn<UseRefLabel>(() => "X");
    const { rerender } = withLabel(hook, <EntityRefValue value={`  ${REF}/extra?q=1#h `} vaultId="v9" />);
    expect(hook).toHaveBeenCalledWith({ id: "osm-r-59470", uri: REF }, "v9");
    hook.mockClear();
    rerender(
      <RefLabelContext.Provider value={hook}>
        <EntityRefValue value="Paris" vaultId="v9" />
      </RefLabelContext.Provider>,
    );
    expect(hook).toHaveBeenCalledWith(null, "v9");
  });

  it("the title is the stored value untouched, even when the reference was rebuilt from it", () => {
    withLabel(() => "A", <EntityRefValue value={`${REF}?q=1`} vaultId="v1" onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "A" }).getAttribute("title")).toBe(`${REF}?q=1`);
  });

  it("a value that is not a reference is drawn as it is, in a breaking span, with no button", () => {
    const { container } = withLabel(() => "never", <EntityRefValue value="Paris, France" vaultId="v1" onOpen={() => {}} />);
    expect(container.innerHTML).toBe('<span class="break-words">Paris, France</span>');
  });

  it("a type address is not a reference", () => {
    const { container } = withLabel(() => "never", <EntityRefValue value="https://geo.example.test/base/t/Place" vaultId="v1" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toBe("https://geo.example.test/base/t/Place");
  });

  it("throws, naming the provider, when there is none: for a reference and for plain text", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = "entity-ref-value: wrap the app in <RefLabelContext.Provider value={useRefLabel}>";
    expect(() => render(<EntityRefValue value={REF} vaultId="v1" />)).toThrow(message);
    expect(() => render(<EntityRefValue value="Paris" vaultId="v1" />)).toThrow(message);
    quiet.mockRestore();
  });
});

describe("isEntityRefValue", () => {
  it.each([
    [REF, true],
    ["https://example.test/vault/e/abc", true],
    ["  https://example.test/base/e/abc  ", true],
    ["HTTP://EXAMPLE.TEST/BASE/E/abc", true],
    ["https://example.test/base/e/abc/extra", true],
    ["https://example.test/base/t/Place", false],
    ["https://example.test/base/r/abc", false],
    ["https://example.test/base/e/", false],
    ["abc", false],
    ["", false],
    ["   ", false],
  ])("%j is %s", (value, expected) => {
    expect(isEntityRefValue(value)).toBe(expected);
  });
});
