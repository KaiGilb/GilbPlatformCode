import { createElement } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MODAL_LAYER_Z, ModalPortalContext, eventTargetInTopDialog, modalIsOpen, openPortalRoots, useModalPortalTarget } from "./index";

afterEach(() => {
  cleanup();
  openPortalRoots.splice(0, openPortalRoots.length);
  document.body.innerHTML = "";
});

function root(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("MODAL_LAYER_Z", () => {
  it("is 100", () => {
    expect(MODAL_LAYER_Z).toBe(100);
  });
});

describe("modalIsOpen", () => {
  it("is false with no root, true while a root is pushed, false again once popped", () => {
    expect(modalIsOpen()).toBe(false);
    const a = root();
    openPortalRoots.push(a);
    expect(modalIsOpen()).toBe(true);
    const b = root();
    openPortalRoots.push(b);
    expect(modalIsOpen()).toBe(true);
    openPortalRoots.pop();
    expect(modalIsOpen()).toBe(true);
    openPortalRoots.pop();
    expect(modalIsOpen()).toBe(false);
  });
});

describe("eventTargetInTopDialog", () => {
  it("is false with no root open", () => {
    expect(eventTargetInTopDialog(document.body)).toBe(false);
  });
  it("is false for null and for a target that is not a Node", () => {
    openPortalRoots.push(root());
    expect(eventTargetInTopDialog(null)).toBe(false);
    expect(eventTargetInTopDialog(window)).toBe(false);
  });
  it("is true only for a node inside the NEWEST root", () => {
    const oldRoot = root();
    const newRoot = root();
    const inOld = document.createElement("button");
    const inNew = document.createElement("button");
    oldRoot.appendChild(inOld);
    newRoot.appendChild(inNew);
    openPortalRoots.push(oldRoot, newRoot);
    expect(eventTargetInTopDialog(inNew)).toBe(true);
    expect(eventTargetInTopDialog(newRoot)).toBe(true);
    expect(eventTargetInTopDialog(inOld)).toBe(false);
    expect(eventTargetInTopDialog(oldRoot)).toBe(false);
    expect(eventTargetInTopDialog(document.body)).toBe(false);
  });
});

describe("useModalPortalTarget", () => {
  it("returns document.body without a provider", () => {
    const { result } = renderHook(() => useModalPortalTarget());
    expect(result.current).toBe(document.body);
  });
  it("returns the provided element inside ModalPortalContext.Provider", () => {
    const el = root();
    const { result } = renderHook(() => useModalPortalTarget(), {
      wrapper: ({ children }) => createElement(ModalPortalContext.Provider, { value: el }, children),
    });
    expect(result.current).toBe(el);
  });
  it("a provider holding null reads as document.body", () => {
    const { result } = renderHook(() => useModalPortalTarget(), {
      wrapper: ({ children }) => createElement(ModalPortalContext.Provider, { value: null }, children),
    });
    expect(result.current).toBe(document.body);
  });
});
