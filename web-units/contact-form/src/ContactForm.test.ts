// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yFormLabel, RuleA11yErrorAssoc, RuleA11yAriaWhenNeeded). Behaviour is the starter's components/ContactForm.vue at 80ad391.
import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import axe from "axe-core";
import ContactForm from "./ContactForm.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const answer = (status: number, body = "") => vi.fn(async () => new Response(body, { status }));

async function fill(w: VueWrapper) {
  const [name, email] = w.findAll("input");
  await name!.setValue("Ana");
  await email!.setValue("ana@example.test");
  await w.find("textarea").setValue("Hello there");
}

describe("ContactForm", () => {
  describe("sending", () => {
    test("posts name, email and message as JSON to /api/contact; a 2xx with a body shows the sent line", async () => {
      const fetchMock = answer(200, '{"ok":true}');
      vi.stubGlobal("fetch", fetchMock);
      wrapper = mount(ContactForm, { attachTo: document.body });
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/contact");
      expect(JSON.parse(String(init.body))).toEqual({ name: "Ana", email: "ana@example.test", message: "Hello there" });
      expect(document.querySelector(".cf-ok")!.textContent).toBe("Thanks — your message was sent.");
    });
    test("as the starter's form did, a 2xx with an empty body is not taken as sent", async () => {
      vi.stubGlobal("fetch", answer(200, ""));
      wrapper = mount(ContactForm, { attachTo: document.body });
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(document.querySelector(".cf-error")!.textContent).toBe("Something went wrong. Please try again.");
    });
    test("a non-2xx answer shows the error line", async () => {
      vi.stubGlobal("fetch", answer(400, '{"error":"bad"}'));
      wrapper = mount(ContactForm, { attachTo: document.body });
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(document.querySelector(".cf-error")).not.toBeNull();
    });
    test("with a Turnstile key it draws the widget placeholder and sends the token Turnstile wrote inside it", async () => {
      const send = vi.fn(async () => ({ ok: true }));
      wrapper = mount(ContactForm, { props: { turnstileSiteKey: "0xKEY", send }, attachTo: document.body });
      const widget = document.querySelector(".cf-turnstile")!;
      expect(widget.getAttribute("data-sitekey")).toBe("0xKEY");
      // What Turnstile's script does once the visitor passes: a hidden input inside the widget.
      widget.innerHTML = '<input type="hidden" name="cf-turnstile-response" value="tok-123">';
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(send).toHaveBeenCalledWith({ name: "Ana", email: "ana@example.test", message: "Hello there", turnstileToken: "tok-123" });
    });
    test("without a key there is no widget, and the token is absent", async () => {
      const send = vi.fn(async () => ({ ok: true }));
      wrapper = mount(ContactForm, { props: { send }, attachTo: document.body });
      expect(document.querySelector(".cf-turnstile")).toBeNull();
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(send).toHaveBeenCalledWith({ name: "Ana", email: "ana@example.test", message: "Hello there", turnstileToken: undefined });
    });
    test("a token outside this form is not read (another form's widget on the page)", async () => {
      const send = vi.fn(async () => ({ ok: true }));
      document.body.insertAdjacentHTML("afterbegin", '<input type="hidden" name="cf-turnstile-response" value="someone-else">');
      wrapper = mount(ContactForm, { props: { send }, attachTo: document.body });
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect((send.mock.calls[0] as unknown as [{ turnstileToken?: string }])[0].turnstileToken).toBeUndefined();
    });
    test("while sending, the button is disabled and reads Sending…", async () => {
      let release!: (v: unknown) => void;
      const send = vi.fn(() => new Promise((ok) => { release = ok; }));
      wrapper = mount(ContactForm, { props: { send }, attachTo: document.body });
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      const button = wrapper.find("button").element as HTMLButtonElement;
      expect([button.disabled, button.textContent!.trim()]).toEqual([true, "Sending…"]);
      release({ ok: true });
      await flushPromises();
      expect([button.disabled, button.textContent!.trim()]).toEqual([false, "Send message"]);
    });
  });

  describe("structure", () => {
    test("three required, labelled fields; two forms on one page get different ids", () => {
      wrapper = mount({ render: () => [h(ContactForm), h(ContactForm)] }, { attachTo: document.body });
      const fields = [...document.querySelectorAll("input, textarea")] as HTMLInputElement[];
      expect(fields).toHaveLength(6);
      expect(new Set(fields.map((f) => f.id)).size).toBe(6);
      for (const f of fields) {
        expect(f.required).toBe(true);
        expect(document.querySelector(`label[for="${f.id}"]`)).not.toBeNull();
      }
      expect((fields[1] as HTMLInputElement).type).toBe("email");
    });
    test("every word can be replaced", () => {
      wrapper = mount(ContactForm, { props: { labels: { name: "Navn", email: "E-post", message: "Melding", send: "Send" } }, attachTo: document.body });
      expect([...document.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Navn", "E-post", "Melding"]);
      expect(document.querySelector("button")!.textContent!.trim()).toBe("Send");
    });
    test("the answer appears inside a polite live region that is in the form from the start", async () => {
      wrapper = mount(ContactForm, { props: { send: async () => ({ ok: true }) }, attachTo: document.body });
      const live = document.querySelector('form [role="status"]')!;
      expect(live.getAttribute("aria-live")).toBe("polite");
      expect(live.children).toHaveLength(0);
      await fill(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(live.querySelector(".cf-ok")).not.toBeNull();
    });
    test("server and browser agree on the ids (useId)", async () => {
      const html = await renderToString(createSSRApp({ render: () => h(ContactForm) }));
      for (const m of html.matchAll(/<(?:input|textarea)[^>]* id="([^"]+)"/g)) expect(html).toContain(`for="${m[1]}"`);
    });
  });

  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations, before and after an error (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(ContactForm, { props: { turnstileSiteKey: "k", send: async () => { throw new Error("x"); } }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    await fill(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("ContactForm box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "ContactForm.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".cf, .cf * { box-sizing: border-box; }");
  });
});
