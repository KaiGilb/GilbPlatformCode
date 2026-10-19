// Spec: Kai-Zen decision 2026-10-20 (contact-form 0.2.0: token reset after send, optional fields, compact variant).
// Behaviour read from the site's ContactForm.vue (Jairam-Gilb/gilb-websites-web redesign-scrollcraft b78b1f9). Tests written new.
import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import axe from "axe-core";
import ContactForm from "./ContactForm.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); delete (window as unknown as { turnstile?: unknown }).turnstile; });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const ok = () => vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

describe("Turnstile token reset", () => {
  test.each([["a good answer", ok()], ["a failing answer", vi.fn(async () => new Response("", { status: 500 }))], ["a dropped request", vi.fn(async () => { throw new Error("net"); })]])("after %s the form's own widget is reset once", async (_n, f) => {
    vi.stubGlobal("fetch", f);
    const reset = vi.fn();
    (window as unknown as { turnstile: unknown }).turnstile = { reset };
    wrapper = mount(ContactForm, { props: { turnstileSiteKey: "k" }, attachTo: document.body });
    await wrapper.find("input").setValue("A");
    await wrapper.find('input[type="email"]').setValue("a@example.test");
    await wrapper.find("textarea").setValue("m");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset.mock.calls[0]![0]).toBe(document.querySelector(".cf-turnstile"));
  });
  test("a custom sender that throws also resets", async () => {
    const reset = vi.fn();
    (window as unknown as { turnstile: unknown }).turnstile = { reset };
    wrapper = mount(ContactForm, { props: { turnstileSiteKey: "k", send: async () => { throw new Error("x"); } }, attachTo: document.body });
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(reset).toHaveBeenCalledTimes(1);
  });
  test("no widget, no Turnstile script, or a reset that throws: the send still ends normally", async () => {
    vi.stubGlobal("fetch", ok());
    wrapper = mount(ContactForm, { attachTo: document.body });
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(document.querySelector(".cf-ok")).not.toBeNull();
    wrapper.unmount();
    (window as unknown as { turnstile: unknown }).turnstile = { reset: () => { throw new Error("not rendered"); } };
    wrapper = mount(ContactForm, { props: { turnstileSiteKey: "k" }, attachTo: document.body });
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(document.querySelector(".cf-ok")).not.toBeNull();
  });
});

describe("optional fields", () => {
  test("by default there is no Company field and the body has no company (unchanged)", async () => {
    const f = ok(); vi.stubGlobal("fetch", f);
    wrapper = mount(ContactForm, { attachTo: document.body });
    expect(document.querySelectorAll("input")).toHaveLength(2);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(Object.keys(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)))).toEqual(["name", "email", "message"]);
  });
  test("showCompany adds an optional Company field that is sent", async () => {
    const f = ok(); vi.stubGlobal("fetch", f);
    wrapper = mount(ContactForm, { props: { showCompany: true }, attachTo: document.body });
    const c = document.querySelector<HTMLInputElement>('input[autocomplete="organization"]')!;
    expect(c.required).toBe(false);
    expect(document.querySelector(`label[for="${c.id}"]`)!.textContent).toBe("Company (optional)");
    await wrapper.find(`#${c.id}`).setValue("Acme");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).company).toBe("Acme");
  });
  test("requireName=false and requireMessage=false make those fields optional and say so; Email stays required", () => {
    wrapper = mount(ContactForm, { props: { requireName: false, requireMessage: false }, attachTo: document.body });
    expect(document.querySelector<HTMLInputElement>('input[autocomplete="name"]')!.required).toBe(false);
    expect(document.querySelector("textarea")!.required).toBe(false);
    expect(document.querySelector<HTMLInputElement>('input[type="email"]')!.required).toBe(true);
    expect([...document.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Name (optional)", "Email", "Message (optional)"]);
  });
  test("the words are replaceable", () => {
    wrapper = mount(ContactForm, { props: { showCompany: true, requireName: false, labels: { company: "Firma", optional: "(valgfritt)" } }, attachTo: document.body });
    expect([...document.querySelectorAll("label")].map((l) => l.textContent)).toContain("Firma (valgfritt)");
  });
});

describe("compact", () => {
  test("Name and Email only, a full-width button, a compact widget; Company is not drawn even if asked", () => {
    wrapper = mount(ContactForm, { props: { compact: true, showCompany: true, turnstileSiteKey: "k" }, attachTo: document.body });
    expect(document.querySelectorAll("input")).toHaveLength(2);
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.querySelector("form")!.classList.contains("cf-compact")).toBe(true);
    expect(document.querySelector(".cf-turnstile")!.getAttribute("data-size")).toBe("compact");
  });
  test("the normal widget has no size attribute", () => {
    wrapper = mount(ContactForm, { props: { turnstileSiteKey: "k" }, attachTo: document.body });
    expect(document.querySelector(".cf-turnstile")!.hasAttribute("data-size")).toBe(false);
  });
  test("axe: no violations for compact, and for all optional fields", async () => {
    wrapper = mount(ContactForm, { props: { compact: true }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    wrapper.unmount();
    wrapper = mount(ContactForm, { props: { showCompany: true, requireName: false, requireMessage: false }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});
