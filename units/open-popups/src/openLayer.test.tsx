import { afterEach, describe, expect, it } from "vitest";
import { insideOpenLayer, openPortalRoots } from "./index";

afterEach(() => {
  openPortalRoots.splice(0, openPortalRoots.length);
  document.body.innerHTML = "";
});

function inside(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

describe("insideOpenLayer", () => {
  it("is false for null and for a node outside every layer while nothing is open", () => {
    expect(insideOpenLayer(null)).toBe(false);
    const host = inside(`<button id="b"></button>`);
    expect(insideOpenLayer(host.querySelector("#b"))).toBe(false);
  });
  it("is true while a create dialog root is open, even for null and for an outside node", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    openPortalRoots.push(root);
    expect(insideOpenLayer(null)).toBe(true);
    const outside = inside(`<button id="b"></button>`);
    expect(insideOpenLayer(outside.querySelector("#b"))).toBe(true);
  });
  it("is false again once the root is gone", () => {
    const root = document.createElement("div");
    openPortalRoots.push(root);
    openPortalRoots.pop();
    expect(insideOpenLayer(null)).toBe(false);
  });
  it('is true for a node inside [role="dialog"]', () => {
    const host = inside(`<div role="dialog"><button id="b"></button></div>`);
    expect(insideOpenLayer(host.querySelector("#b"))).toBe(true);
  });
  it('is true for a node inside [aria-modal="true"]', () => {
    const host = inside(`<div aria-modal="true"><button id="b"></button></div>`);
    expect(insideOpenLayer(host.querySelector("#b"))).toBe(true);
  });
  it('is true for a node inside [data-testid="connected-create-root"]', () => {
    const host = inside(`<div data-testid="connected-create-root"><button id="b"></button></div>`);
    expect(insideOpenLayer(host.querySelector("#b"))).toBe(true);
  });
  it("is true for the layer element itself", () => {
    const host = inside(`<div role="dialog" id="d"></div>`);
    expect(insideOpenLayer(host.querySelector("#d"))).toBe(true);
  });
  it("is true for a text node whose parent is inside a layer, false for one outside", () => {
    const host = inside(`<div role="dialog"><p id="p">hello</p></div><p id="q">outside</p>`);
    expect(insideOpenLayer(host.querySelector("#p")!.firstChild)).toBe(true);
    expect(insideOpenLayer(host.querySelector("#q")!.firstChild)).toBe(false);
  });
  it('is false for aria-modal="false" and for an unrelated role', () => {
    const host = inside(`<div aria-modal="false"><button id="a"></button></div><div role="menu"><button id="b"></button></div>`);
    expect(insideOpenLayer(host.querySelector("#a"))).toBe(false);
    expect(insideOpenLayer(host.querySelector("#b"))).toBe(false);
  });
  it("is false for a detached text node with no parent", () => {
    expect(insideOpenLayer(document.createTextNode("x"))).toBe(false);
  });
});
