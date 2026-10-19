// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yFormLabel, RuleA11yErrorAssoc, RuleA11yAriaWhenNeeded). Behaviour is the starter's components/catalog/NewsletterSignup.vue at 80ad391.
import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import axe from "axe-core";
import NewsletterSignup from "./NewsletterSignup.vue";
import { postJson } from "./send";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const answer = (status: number, body = "") => vi.fn(async () => new Response(body, { status }));

async function fillAndSend(w: VueWrapper, email = "a@example.test") {
  await w.find("input").setValue(email);
  await w.find("form").trigger("submit");
}

describe("NewsletterSignup", () => {
  describe("sending", () => {
    test("posts { email } as JSON to /api/newsletter by default, then thanks and clears the field", async () => {
      const fetchMock = answer(200, "");
      vi.stubGlobal("fetch", fetchMock);
      wrapper = mount(NewsletterSignup, { attachTo: document.body });
      await fillAndSend(wrapper);
      await flushPromises();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/newsletter");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ email: "a@example.test" });
      expect(document.querySelector(".nl-ok")!.textContent).toBe("You're subscribed — thanks!");
      expect((wrapper.find("input").element as HTMLInputElement).value).toBe("");
    });
    test("actionUrl changes the address", async () => {
      const fetchMock = answer(204);
      vi.stubGlobal("fetch", fetchMock);
      wrapper = mount(NewsletterSignup, { props: { actionUrl: "/subscribe" }, attachTo: document.body });
      await fillAndSend(wrapper);
      await flushPromises();
      expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/subscribe");
    });
    test("a non-2xx answer or a network failure shows the error line and keeps the address", async () => {
      vi.stubGlobal("fetch", answer(500));
      wrapper = mount(NewsletterSignup, { attachTo: document.body });
      await fillAndSend(wrapper);
      await flushPromises();
      expect(document.querySelector(".nl-error")!.textContent).toBe("Something went wrong. Try again.");
      expect((wrapper.find("input").element as HTMLInputElement).value).toBe("a@example.test");
      wrapper.unmount();
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
      wrapper = mount(NewsletterSignup, { attachTo: document.body });
      await fillAndSend(wrapper);
      await flushPromises();
      expect(document.querySelector(".nl-error")).not.toBeNull();
    });
    test("while sending, the button is disabled", async () => {
      let release!: () => void;
      const send = vi.fn(() => new Promise<void>((ok) => { release = ok; }));
      wrapper = mount(NewsletterSignup, { props: { send }, attachTo: document.body });
      await fillAndSend(wrapper);
      expect((wrapper.find("button").element as HTMLButtonElement).disabled).toBe(true);
      release();
      await flushPromises();
      expect((wrapper.find("button").element as HTMLButtonElement).disabled).toBe(false);
      expect(send).toHaveBeenCalledWith({ email: "a@example.test" });
    });
  });

  describe("words and structure", () => {
    test("heading, line and button label are props; the field's label and messages can be replaced", async () => {
      wrapper = mount(NewsletterSignup, { props: { heading: "Join", subtitle: "Monthly.", buttonLabel: "Sign up", labels: { email: "E-post", failed: "Feil." }, send: async () => { throw new Error("x"); } }, attachTo: document.body });
      expect(document.querySelector("h2")!.textContent).toBe("Join");
      expect(document.querySelector(".nl-subtitle")!.textContent).toBe("Monthly.");
      expect(document.querySelector("button")!.textContent).toBe("Sign up");
      expect(document.querySelector("label")!.textContent).toBe("E-post");
      await fillAndSend(wrapper);
      await flushPromises();
      expect(document.querySelector(".nl-error")!.textContent).toBe("Feil.");
    });
    test("the email field is labelled, and two signups on one page get different ids", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      wrapper = mount({ render: () => [h(NewsletterSignup), h(NewsletterSignup)] }, { attachTo: host });
      const inputs = [...document.querySelectorAll("input")];
      expect(new Set(inputs.map((i) => i.id)).size).toBe(2);
      for (const i of inputs) expect(document.querySelector(`label[for="${i.id}"]`)).not.toBeNull();
    });
    test("the answer appears inside a polite live region that is in the page from the start", async () => {
      wrapper = mount(NewsletterSignup, { props: { send: async () => undefined }, attachTo: document.body });
      const live = document.querySelector('[role="status"]')!;
      expect(live.getAttribute("aria-live")).toBe("polite");
      expect(live.children).toHaveLength(0);
      await fillAndSend(wrapper);
      await flushPromises();
      expect(live.querySelector(".nl-ok")).not.toBeNull();
    });
    test("server and browser agree on the field's id (useId)", async () => {
      const html = await renderToString(createSSRApp({ render: () => h(NewsletterSignup) }));
      const id = /<input id="([^"]+)"/.exec(html)![1];
      expect(html).toContain(`for="${id}"`);
    });
  });

  describe("postJson", () => {
    test("returns parsed JSON, text when not JSON, undefined when empty; throws outside 2xx", async () => {
      vi.stubGlobal("fetch", answer(200, '{"ok":true}'));
      expect(await postJson("/x", {})).toEqual({ ok: true });
      vi.stubGlobal("fetch", answer(200, "fine"));
      expect(await postJson("/x", {})).toBe("fine");
      vi.stubGlobal("fetch", answer(200, ""));
      expect(await postJson("/x", {})).toBeUndefined();
      vi.stubGlobal("fetch", answer(404));
      await expect(postJson("/x", {})).rejects.toThrow("404");
    });
  });

  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations, before and after an error (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(NewsletterSignup, { props: { heading: "Join", send: async () => { throw new Error("x"); } }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    await fillAndSend(wrapper);
    await flushPromises();
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("NewsletterSignup box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "NewsletterSignup.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".nl, .nl * { box-sizing: border-box; }");
  });
});
