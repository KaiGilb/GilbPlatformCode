// Behaviour tests for the waiting-list form. New for this unit; the source had none of these.
import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import WaitlistForm from "./WaitlistForm.vue";
import { TURNSTILE_POLL_MS } from "./turnstile";
import type { WaitlistField } from "./types";

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  for (const script of [...document.scripts]) script.remove();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const axeIds = async () =>
  (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map(
    (v: { id: string }) => v.id,
  );

const notice = { text: "We use this only to manage your place.", linkLabel: "Privacy", linkHref: "/privacy" };

async function setEmail(w: VueWrapper, value = "ada@example.test"): Promise<void> {
  await w.find('input[type="email"]').setValue(value);
}

describe("WaitlistForm defaults", () => {
  test("only email is required; every other label ends with the muted optional word; experience opens on not-yet", () => {
    wrapper = mount(WaitlistForm, { attachTo: document.body });
    const controls = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")];
    expect(controls.filter((el) => el.required).map((el) => el.name)).toEqual(["email"]);
    const optional = [...document.querySelectorAll(".wl-opt")].map((el) => el.textContent?.trim());
    expect(optional).toEqual(["(optional)", "(optional)", "(optional)", "(optional)", "(optional)"]);
    for (const el of document.querySelectorAll("label.wl-label, legend.wl-legend")) {
      if (!el.querySelector(".wl-opt")) continue;
      expect(el.textContent!.replace(/\s+/g, " ").trim().endsWith(" (optional)")).toBe(true);
    }
    const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]')!;
    const nameLabel = [...document.querySelectorAll<HTMLLabelElement>("label.wl-label")].find(
      (label) => label.htmlFor === nameInput.id,
    );
    expect(nameLabel?.textContent?.replace(/\s+/g, " ").trim()).toBe("Name (optional)");
    const email = document.querySelector<HTMLInputElement>('input[type="email"]')!;
    const emailLabel = [...document.querySelectorAll("label")].find((label) => label.htmlFor === email.id);
    expect(emailLabel?.textContent).toContain("Email");
    expect(emailLabel?.textContent).not.toContain("optional");
    expect(email.maxLength).toBe(254);
    expect(email.autocomplete).toBe("email");
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')!.maxLength).toBe(80);
    const experience = [...document.querySelectorAll<HTMLInputElement>('input[name="experience"]')];
    expect(experience.map((el) => el.value)).toEqual(["not-yet", "a-little", "with-ai", "i-code"]);
    expect(experience.find((el) => el.checked)?.value).toBe("not-yet");
    expect(document.querySelector('input[name="teamSize"]:checked')).toBeNull();
    expect([...document.querySelectorAll<HTMLInputElement>('input[name="teamSize"]')].map((el) => el.value)).toEqual([
      "just-me",
      "2-10",
      "11-50",
      "50-plus",
    ]);
  });

  test("server-rendered labels keep the space before the optional word", async () => {
    const html = await renderToString(createSSRApp(WaitlistForm));
    // Vue marks the v-if template with <!--[-->; the space is the text node after that marker.
    expect(html.replace(/<!--[\s\S]*?-->/g, "")).toMatch(/Name <span[^>]*class="wl-opt"/);
  });

  test("two forms on one page do not share an id", () => {
    wrapper = mount({ render: () => [h(WaitlistForm), h(WaitlistForm)] }, { attachTo: document.body });
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a choice answer can carry one line of help, and the notice is a sentence above the button, not a checkbox", () => {
    const fields: WaitlistField[] = [
      { name: "email", kind: "email", label: "Email", required: true, maxLength: 254 },
      {
        name: "experience",
        kind: "choice",
        label: "Experience building apps",
        defaultValue: "not-yet",
        options: [{ value: "not-yet", label: "Not yet", help: "A fine place to start." }],
      },
    ];
    wrapper = mount(WaitlistForm, { props: { fields, notice }, attachTo: document.body });
    expect(document.body.textContent).toContain("A fine place to start.");
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    const note = document.querySelector(".wl-notice")!;
    const button = document.querySelector("button")!;
    expect(note.textContent).toBe(`${notice.text} ${notice.linkLabel}`);
    expect(note.querySelector("a")?.getAttribute("href")).toBe("/privacy");
    expect(note.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("labels replace the button and the optional word", () => {
    wrapper = mount(WaitlistForm, {
      props: { labels: { submit: "Sign me up", optional: "(not required)" } },
      attachTo: document.body,
    });
    expect(document.querySelector("button")!.textContent!.trim()).toBe("Sign me up");
    expect(document.querySelector(".wl-opt")!.textContent).toContain("(not required)");
  });
});

describe("WaitlistForm submit", () => {
  test("a bad email is marked invalid, described by the error, focused, and not sent", async () => {
    const send = vi.fn(async () => true);
    wrapper = mount(WaitlistForm, { props: { send }, attachTo: document.body });
    const email = wrapper.find('input[type="email"]');
    await email.setValue("not-an-email");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const el = email.element as HTMLInputElement;
    expect(el.getAttribute("aria-invalid")).toBe("true");
    const described = el.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    const texts = described!.split(" ").map((id) => document.getElementById(id)?.textContent ?? "");
    expect(texts.join(" ")).toContain("name@example.com");
    expect(document.activeElement).toBe(el);
    expect(send).not.toHaveBeenCalled();
    expect(el.value).toBe("not-an-email");
  });

  test("a good submit disables the button, then replaces the form and emits the body", async () => {
    let release!: (value: unknown) => void;
    const send = vi.fn(() => new Promise((ok) => { release = ok; }));
    wrapper = mount(WaitlistForm, { props: { send, page: "pricing", notice }, attachTo: document.body });
    await wrapper.find('input[name="name"]').setValue("  Ada  ");
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    const button = document.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent!.trim()).toBe("Sending…");
    expect(send).toHaveBeenCalledOnce();
    release(true);
    await flushPromises();
    expect(document.querySelector("form")).toBeNull();
    const heading = document.querySelector(".wl-sent-heading") as HTMLElement;
    expect(heading.textContent).toBe("You're on the list.");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
    const body = wrapper.emitted("sent")?.[0]?.[0] as Record<string, string>;
    expect(body).toEqual({
      name: "Ada",
      email: "ada@example.test",
      experience: "not-yet",
      page: "pricing",
      notice: `${notice.text} ${notice.linkLabel}`,
    });
    expect(document.querySelector(".wl-sent")!.textContent).toContain("We will write when there is room.");
  });

  test("a thrown send shows the error in the live region, keeps the answers, and emits failed", async () => {
    const send = vi.fn(async () => {
      throw new Error("down");
    });
    wrapper = mount(WaitlistForm, { props: { send }, attachTo: document.body });
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent!.trim()).toBe("");
    await wrapper.find('input[name="name"]').setValue("Ada");
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(live.textContent).toContain("That did not go through. Your answers are kept; please try again.");
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe("Ada");
    expect(document.querySelector<HTMLInputElement>('input[type="email"]')!.value).toBe("ada@example.test");
    expect(document.querySelector("form")).not.toBeNull();
    expect((wrapper.emitted("failed")?.[0]?.[0] as Error).message).toBe("down");
    expect(document.querySelector("button")!.textContent!.trim()).toBe("Join the waiting list");
  });

  test.each([false, 0, null, ""])("a falsy answer (%j) is not sent", async (answer) => {
    const send = vi.fn(async () => answer);
    wrapper = mount(WaitlistForm, { props: { send }, attachTo: document.body });
    await wrapper.find('input[name="name"]').setValue("Ada");
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toContain("did not go through");
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe("Ada");
    expect(wrapper.emitted("sent")).toBeUndefined();
    expect(wrapper.emitted("failed")).toHaveLength(1);
    wrapper.unmount();
    wrapper = undefined;
  });

  test("the default sender posts JSON and a non-2xx answer is a failure", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(WaitlistForm, { props: { page: "home" }, attachTo: document.body });
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/waitlist");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    const body = JSON.parse(String(init.body));
    expect(body.email).toBe("ada@example.test");
    expect(body.experience).toBe("not-yet");
    expect(body.page).toBe("home");
    expect(body.turnstileToken).toBeUndefined();
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toContain("did not go through");
  });
});

describe("WaitlistForm no-JS shape", () => {
  test("the form has no action by default (it posts to the current page), and the given noScriptAction when set", () => {
    wrapper = mount(WaitlistForm, { props: { actionUrl: "/elsewhere/join" }, attachTo: document.body });
    expect(document.querySelector("form")!.hasAttribute("action")).toBe(false);
    wrapper.unmount();
    wrapper = mount(WaitlistForm, { props: { actionUrl: "/elsewhere/join", noScriptAction: "/join-plain" }, attachTo: document.body });
    expect(document.querySelector("form")!.getAttribute("action")).toBe("/join-plain");
  });

  test("the script path sends to actionUrl, not to noScriptAction", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(WaitlistForm, { props: { actionUrl: "/api/join", noScriptAction: "/join-plain" }, attachTo: document.body });
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/join");
  });

  test("the form is a post form and every control has a name", () => {
    wrapper = mount(WaitlistForm, { attachTo: document.body });
    const form = document.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("post");
    const controls = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control.getAttribute("name")).toBeTruthy();
  });
});

describe("WaitlistForm Turnstile token", () => {
  function arm(token: { value: string }): void {
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: () => "widget-1",
      getResponse: () => token.value,
      reset(): void { token.value = ""; },
      remove(): void {},
    };
    document.querySelector("script")?.dispatchEvent(new Event("load"));
  }

  test("a send before the token waits, then sends the token when it arrives", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async (_body: Record<string, string>) => true);
    const token = { value: "" };
    wrapper = mount(WaitlistForm, {
      props: { send, page: "home", turnstileSiteKey: "site-key" },
      attachTo: document.body,
    });
    await setEmail(wrapper);
    if (!document.querySelector("script")) await wrapper.find('input[type="email"]').trigger("focusin");
    arm(token);
    await flushPromises();
    await wrapper.find("form").trigger("submit");
    expect(send).not.toHaveBeenCalled();
    token.value = "tok-1";
    await vi.advanceTimersByTimeAsync(TURNSTILE_POLL_MS);
    await flushPromises();
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({
      email: "ada@example.test",
      experience: "not-yet",
      page: "home",
      turnstileToken: "tok-1",
    });
  });

  test("when the token does not arrive, the error shows and the answers stay", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => true);
    wrapper = mount(WaitlistForm, {
      props: { send, turnstileSiteKey: "site-key" },
      attachTo: document.body,
    });
    await wrapper.find('input[name="name"]').setValue("Ada");
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    expect(send).not.toHaveBeenCalled();
    expect(document.querySelector("button")!.textContent!.trim()).toBe("Sending…");
    await vi.advanceTimersByTimeAsync(7999);
    await flushPromises();
    expect(send).not.toHaveBeenCalled();
    // While it waits, the live region says it is sending (it is not an error yet).
    expect(document.querySelector('[aria-live="polite"]')!.textContent!.trim()).toBe("Sending…");
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(send).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toContain("did not go through");
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe("Ada");
    expect(document.querySelector<HTMLInputElement>('input[type="email"]')!.value).toBe("ada@example.test");
    expect(wrapper.emitted("failed")).toHaveLength(1);
    expect(wrapper.emitted("sent")).toBeUndefined();
  });
});

describe("WaitlistForm axe", () => {
  test("no violations while idle, and none after a failed send", async () => {
    const send = vi.fn(async () => {
      throw new Error("down");
    });
    wrapper = mount(WaitlistForm, { props: { send, notice }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    await wrapper.find('input[name="name"]').setValue("Ada");
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(document.querySelector(".wl-fail")).not.toBeNull();
    expect(await axeIds()).toEqual([]);
  });
});

// ---- QA round 2 ----

interface FakeApi {
  render: ReturnType<typeof vi.fn>;
  getResponse: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}
function fakeApi(): FakeApi {
  return { render: vi.fn(() => "w"), getResponse: vi.fn(() => ""), reset: vi.fn(), remove: vi.fn() };
}
async function submit(w: VueWrapper): Promise<void> {
  await w.find("form").trigger("submit");
  await flushPromises();
}
const emailOnly: WaitlistField[] = [{ name: "email", kind: "email", label: "Email", required: true }];

describe("WaitlistForm announces and clears", () => {
  test("while sending, the live region holds the sending word; it is empty before and after a failure ends it", async () => {
    let release!: (value: unknown) => void;
    wrapper = mount(WaitlistForm, {
      props: { send: () => new Promise((ok) => { release = ok; }), labels: { sending: "Working" } },
      attachTo: document.body,
    });
    const live = document.querySelector('[role="status"]')!;
    expect(live.textContent!.trim()).toBe("");
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    expect(live.textContent!.trim()).toBe("Working");
    // The sending word is screen-reader only; the region sits between two fixed gaps, so the button stays put.
    expect(live.parentElement?.classList.contains("wl-actions")).toBe(true);
    expect(live.children).toHaveLength(1);
    expect(live.children[0]!.tagName).toBe("SPAN");
    expect(live.children[0]!.className).toBe("wl-sr");
    release(false);
    await flushPromises();
    expect(live.textContent).not.toContain("Working");
    expect(live.textContent).toContain("did not go through");
  });

  test("the live region is role=status and aria-live=polite", () => {
    wrapper = mount(WaitlistForm, { attachTo: document.body });
    const live = document.querySelector(".wl-live")!;
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  test("an email error goes as soon as the address is valid, with its aria-invalid", async () => {
    wrapper = mount(WaitlistForm, { props: { send: async () => true }, attachTo: document.body });
    const email = wrapper.find('input[type="email"]');
    await email.setValue("bad");
    await submit(wrapper);
    expect(email.attributes("aria-invalid")).toBe("true");
    expect(wrapper.find(".wl-field-error").exists()).toBe(true);
    await email.setValue("still bad");
    expect(email.attributes("aria-invalid")).toBe("true");
    await email.setValue("good@example.test");
    expect(email.attributes("aria-invalid")).toBeUndefined();
    expect(email.attributes("aria-describedby")).toBeUndefined();
    expect(wrapper.find(".wl-field-error").exists()).toBe(false);
  });

  test("the same holds for a text field and a choice: only the field fixed is cleared", async () => {
    const fields: WaitlistField[] = [
      { name: "email", kind: "email", label: "Email", required: true },
      { name: "city", kind: "text", label: "City", required: true },
      { name: "size", kind: "choice", label: "Size", required: true, options: [{ value: "s", label: "S" }, { value: "l", label: "L" }] },
    ];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    await submit(wrapper);
    expect(wrapper.findAll(".wl-field-error")).toHaveLength(3);
    await wrapper.find('input[name="city"]').setValue("Oslo");
    expect(wrapper.find('input[name="city"]').attributes("aria-invalid")).toBeUndefined();
    expect(wrapper.findAll(".wl-field-error")).toHaveLength(2);
    expect(wrapper.find('input[type="email"]').attributes("aria-invalid")).toBe("true");
    await wrapper.find('input[name="size"][value="l"]').setValue(true);
    expect(wrapper.find("fieldset").attributes("aria-invalid")).toBeUndefined();
    expect(wrapper.findAll(".wl-field-error")).toHaveLength(1);
    expect(wrapper.find('input[type="email"]').attributes("aria-invalid")).toBe("true");
  });

  test("typing never adds an error to a field that had none", async () => {
    wrapper = mount(WaitlistForm, { attachTo: document.body });
    await wrapper.find('input[type="email"]').setValue("bad");
    expect(wrapper.find(".wl-field-error").exists()).toBe(false);
  });
});

describe("WaitlistForm focus after sent", () => {
  test("a sent slot with no heading: focus lands on the wrapper, not the body", async () => {
    wrapper = mount(WaitlistForm, { props: { send: async () => true }, slots: { sent: "<p>Thanks</p>" }, attachTo: document.body });
    await setEmail(wrapper);
    await submit(wrapper);
    const root = document.querySelector<HTMLElement>(".wl-sent")!;
    expect(root.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(root);
  });

  test("a sent slot with a heading: focus lands on that heading", async () => {
    wrapper = mount(WaitlistForm, {
      props: { send: async () => true },
      slots: { sent: '<h3 id="mine" tabindex="-1">Mine</h3>' },
      attachTo: document.body,
    });
    await setEmail(wrapper);
    await submit(wrapper);
    expect(document.activeElement).toBe(document.getElementById("mine"));
  });

  test("the sent slot is used and gets the body that was sent", async () => {
    wrapper = mount(WaitlistForm, {
      props: { send: async () => true },
      slots: { sent: '<template #sent="{ body }"><h3 id="mine" tabindex="-1">{{ body.email }}</h3></template>' },
      attachTo: document.body,
    });
    await setEmail(wrapper, "a@b.co");
    await submit(wrapper);
    expect(document.getElementById("mine")?.textContent).toBe("a@b.co");
    expect(document.querySelector(".wl-sent-heading")).toBeNull();
  });
});

describe("WaitlistForm ids and defaults", () => {
  test("fields named email and email-help (with help) give no duplicate id", () => {
    const fields: WaitlistField[] = [
      { name: "email-help", kind: "text", label: "X", help: "h1" },
      { name: "email", kind: "email", label: "E", required: true, help: "h2" },
      { name: "a b", kind: "text", label: "AB", help: "h3" },
      { name: "ab", kind: "text", label: "AB2", help: "h4" },
    ];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((el) => el.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(ids.length);
    const email = document.querySelector<HTMLInputElement>('input[type="email"]')!;
    expect(email.id).toMatch(/-field-email$/);
    expect(email.getAttribute("aria-describedby")).toMatch(/-help-email$/);
    for (const input of document.querySelectorAll("input")) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      expect(label).not.toBeNull();
      const help = document.getElementById(input.getAttribute("aria-describedby") ?? "");
      expect(help?.tagName).toBe("P");
    }
  });

  test("names that look like another part's id give no duplicate id: help-email, error-email, and choices a-b+c and a+b-c", () => {
    const fields: WaitlistField[] = [
      { name: "email", kind: "email", label: "E", required: true, help: "h" },
      { name: "help-email", kind: "text", label: "H" },
      { name: "error-email", kind: "text", label: "R" },
      { name: "a-b", kind: "choice", label: "AB", options: [{ value: "c", label: "C" }] },
      { name: "a", kind: "choice", label: "A", options: [{ value: "b-c", label: "BC" }] },
    ];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((el) => el.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a choice added after mount opens on its defaultValue", async () => {
    wrapper = mount(WaitlistForm, { props: { fields: emailOnly }, attachTo: document.body });
    await wrapper.setProps({
      fields: [
        ...emailOnly,
        { name: "z", kind: "choice", label: "Z", defaultValue: "b", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      ],
    });
    expect(document.querySelector<HTMLInputElement>('input[name="z"]:checked')?.value).toBe("b");
  });
});

describe("WaitlistForm wiring (QA gaps)", () => {
  test("a second form mounted after the script has loaded still draws its widget", async () => {
    const api = fakeApi();
    wrapper = mount(WaitlistForm, { props: { turnstileSiteKey: "k" }, attachTo: document.body });
    document.querySelector("script")!.dispatchEvent(new Event("load"));
    (window as unknown as { turnstile: FakeApi }).turnstile = api;
    await flushPromises();
    wrapper.unmount();
    wrapper = mount(WaitlistForm, { props: { turnstileSiteKey: "k" }, attachTo: document.body });
    await flushPromises();
    expect(api.render).toHaveBeenCalledTimes(2);
  });

  test("unmounting removes the widget", async () => {
    const api = fakeApi();
    (window as unknown as { turnstile: FakeApi }).turnstile = api;
    wrapper = mount(WaitlistForm, { props: { turnstileSiteKey: "k" }, attachTo: document.body });
    await flushPromises();
    wrapper.unmount();
    wrapper = undefined;
    expect(api.remove).toHaveBeenCalledWith("w");
  });

  test("a second submit event while sending sends once", async () => {
    const send = vi.fn(() => new Promise(() => {}));
    wrapper = mount(WaitlistForm, { props: { send }, attachTo: document.body });
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    await wrapper.find("form").trigger("submit");
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("a textarea field is a textarea, a choice is radios, and the form is novalidate", () => {
    wrapper = mount(WaitlistForm, { attachTo: document.body });
    expect(document.querySelectorAll("textarea")).toHaveLength(1);
    expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(8);
    expect(document.querySelector("form")!.noValidate).toBe(true);
  });

  test("a notice with a label but no href stores what was shown: the sentence, without the label", async () => {
    const send = vi.fn(async (_body: Record<string, string>) => true);
    wrapper = mount(WaitlistForm, { props: { send, notice: { text: "N", linkLabel: "L" } }, attachTo: document.body });
    await setEmail(wrapper);
    await submit(wrapper);
    expect(send.mock.calls[0]![0].notice).toBe("N");
    expect(document.querySelector(".wl-notice")).toBeNull();
  });

  test("the notice shows while idle with that wording, and not as a link without an href", () => {
    wrapper = mount(WaitlistForm, { props: { notice: { text: "N", linkLabel: "L" } }, attachTo: document.body });
    expect(document.querySelector(".wl-notice")!.textContent).toBe("N");
    expect(document.querySelector(".wl-notice a")).toBeNull();
  });

  test("a too-long answer shows the tooLong message with its maximum", async () => {
    const fields: WaitlistField[] = [...emailOnly, { name: "t", kind: "text", label: "T", maxLength: 3 }];
    wrapper = mount(WaitlistForm, { props: { fields, send: async () => true }, attachTo: document.body });
    await setEmail(wrapper);
    await wrapper.find('input[name="t"]').setValue("abcdef");
    await submit(wrapper);
    expect(wrapper.find(".wl-field-error").text()).toBe("This is longer than 3 characters.");
  });

  test("a required choice has no optional word and shows its error line inside the fieldset", async () => {
    const fields: WaitlistField[] = [
      ...emailOnly,
      { name: "c", kind: "choice", label: "Pick", required: true, options: [{ value: "a", label: "A" }] },
    ];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    expect(wrapper.find("legend").text()).not.toContain("optional");
    await setEmail(wrapper);
    await submit(wrapper);
    const error = wrapper.find("fieldset .wl-field-error");
    expect(error.exists()).toBe(true);
    expect(wrapper.find("fieldset").attributes("aria-describedby")).toBe(error.attributes("id"));
  });

  test("an optional choice reads optional in its legend", () => {
    wrapper = mount(WaitlistForm, { attachTo: document.body });
    expect(wrapper.find("legend").text()).toContain("(optional)");
  });

  test("a focus inside the form loads the script (no IntersectionObserver)", async () => {
    vi.stubGlobal("IntersectionObserver", class { observe(): void {} disconnect(): void {} });
    wrapper = mount(WaitlistForm, { props: { turnstileSiteKey: "k" }, attachTo: document.body });
    expect(document.scripts).toHaveLength(0);
    await wrapper.find('input[name="name"]').trigger("focusin");
    expect(document.scripts).toHaveLength(1);
  });

  test("a field's help text is drawn and described by", () => {
    const fields: WaitlistField[] = [{ name: "email", kind: "email", label: "E", required: true, help: "HELPTEXT" }];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    const help = [...document.querySelectorAll("p")].find((p) => p.textContent === "HELPTEXT")!;
    expect(help).toBeTruthy();
    expect(document.querySelector("input")!.getAttribute("aria-describedby")).toBe(help.id);
  });
});

describe("WaitlistForm control attributes", () => {
  test("an invalid textarea, radio and fieldset are marked and described by their error", async () => {
    const fields: WaitlistField[] = [
      { name: "email", kind: "email", label: "E", required: true },
      { name: "idea", kind: "textarea", label: "Idea", required: true, help: "Say it", rows: 6 },
      { name: "c", kind: "choice", label: "Pick", required: true, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    ];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    await submit(wrapper);
    const area = document.querySelector("textarea")!;
    expect(area.getAttribute("aria-invalid")).toBe("true");
    const areaIds = area.getAttribute("aria-describedby")!.split(" ");
    expect(areaIds).toHaveLength(2);
    expect(document.getElementById(areaIds[0]!)!.textContent).toBe("Say it");
    expect(document.getElementById(areaIds[1]!)!.className).toContain("wl-field-error");
    const fieldset = document.querySelector("fieldset")!;
    const errorId = document.querySelector("fieldset .wl-field-error")!.id;
    expect(fieldset.getAttribute("aria-invalid")).toBe("true");
    expect(fieldset.getAttribute("aria-describedby")).toBe(errorId);
    for (const radio of document.querySelectorAll('input[type="radio"]')) {
      expect(radio.getAttribute("aria-invalid")).toBe("true");
      expect(radio.getAttribute("aria-describedby")).toBe(errorId);
      expect((radio as HTMLInputElement).required).toBe(true);
    }
  });

  test("the textarea takes rows (default 4); the email field is not auto-capitalised or spell-checked; autocomplete is passed", () => {
    const fields: WaitlistField[] = [
      { name: "email", kind: "email", label: "E", required: true, autocomplete: "email" },
      { name: "a", kind: "textarea", label: "A", rows: 7 },
      { name: "b", kind: "textarea", label: "B" },
      { name: "t", kind: "text", label: "T", autocomplete: "name" },
    ];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    const areas = [...document.querySelectorAll("textarea")];
    expect(areas.map((a) => a.rows)).toEqual([7, 4]);
    const email = document.querySelector<HTMLInputElement>('input[type="email"]')!;
    expect(email.getAttribute("autocapitalize")).toBe("none");
    expect(email.getAttribute("spellcheck")).toBe("false");
    expect(email.getAttribute("autocomplete")).toBe("email");
    const text = document.querySelector<HTMLInputElement>('input[name="t"]')!;
    expect(text.getAttribute("autocapitalize")).toBeNull();
    expect(text.getAttribute("spellcheck")).toBeNull();
    expect(text.getAttribute("autocomplete")).toBe("name");
  });
});

describe("WaitlistForm style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "WaitlistForm.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");

  function normCss(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  /** Rules in source order. A rule inside @media is recorded as `@media … > selector`. */
  function styleRules(css: string): { selector: string; body: string }[] {
    const rules: { selector: string; body: string }[] = [];
    function walk(text: string, medias: string[]): void {
      let i = 0;
      while (i < text.length) {
        while (i < text.length && /\s/.test(text.charAt(i))) i += 1;
        if (i >= text.length) break;
        const open = text.indexOf("{", i);
        if (open < 0) break;
        const prelude = text.slice(i, open).trim();
        let depth = 1;
        let j = open + 1;
        while (j < text.length && depth > 0) {
          const ch = text.charAt(j);
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          j += 1;
        }
        const inner = text.slice(open + 1, j - 1);
        if (prelude.startsWith("@media")) walk(inner, [...medias, normCss(prelude)]);
        else if (!prelude.startsWith("@") && prelude) {
          rules.push({ selector: [...medias, normCss(prelude)].join(" > "), body: normCss(inner) });
        }
        i = j;
      }
    }
    walk(css, []);
    return rules;
  }

  function rulesFor(className: string): string[] {
    return styleRules(style)
      .filter((rule) => rule.selector.includes(className))
      .map((rule) => `${rule.selector} { ${rule.body} }`);
  }

  test("the field border is the muted colour at 65 percent", () => {
    expect(style).toMatch(/\.wl-field \{[^}]*border: 1px solid color-mix\(in srgb, var\(--site-block-muted, #4b5563\) 65%, transparent\);/);
  });

  test("the layout is the source's: 36px between parts, 16px between notice, live region and button", () => {
    expect(style).toMatch(/\.wl-form \{ display: flex; flex-direction: column; gap: 2\.25rem; \}/);
    expect(style).toMatch(/\.wl-actions \{ display: flex; flex-direction: column; align-items: flex-start; gap: 1rem; \}/);
    expect(style).not.toContain("* + *");
    expect(SFC).not.toContain("wl-live--shown");
  });

  test("the field rows are the source's: 0.5rem gap, 1.125rem labels, 1rem help and errors at weight 500, 48px controls", () => {
    const flat = normCss(style);
    const rules = [
      ".wl-row { display: flex; flex-direction: column; gap: 0.5rem; }",
      ".wl-label, .wl-legend { display: block; margin: 0; padding: 0; font-size: 1.125rem; line-height: 1.375; font-weight: 500; }",
      ".wl-legend { margin-bottom: 0.75rem; }",
      ".wl-help, .wl-notice { margin: 0; font-size: 1rem; line-height: 1.5; color: var(--site-block-muted, #4b5563); }",
      ".wl-option-help { margin: 0; font-size: 0.875rem; line-height: 1.25rem; color: var(--site-block-muted, #4b5563); }",
      ".wl-field { display: block; width: 100%; min-height: 48px; margin: 0; padding: 0.75rem 1rem; font: inherit; color: inherit; line-height: inherit; background: var(--site-block-bg, #ffffff); border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 65%, transparent); border-radius: var(--site-block-radius, 0.375rem); }",
      ".wl-field-error, .wl-fail { margin: 0; font-size: 1rem; line-height: 1.5; font-weight: 500; color: var(--site-block-danger, #b91c1c); }",
      ".wl-choice-group .wl-field-error { margin-top: 0.5rem; }",
      ".wl-button { display: inline-flex; align-items: center; min-height: 48px; margin: 0; padding: 0.75rem 1.75rem; font: inherit; font-weight: 500; line-height: inherit; cursor: pointer; border: 0; border-radius: var(--site-block-radius, 0.375rem); background: var(--site-block-accent, #2563eb); color: var(--site-block-on-accent, #ffffff); transition: opacity var(--site-block-motion, 150ms); }",
    ];
    for (const rule of rules) expect(flat).toContain(rule);
  });

  // jsdom does no layout, so this guards the cascade: a later rule cannot beat the layout without changing this list.
  test("rule inventory: every rule that styles the form's layout is the one this file means", () => {
    expect(rulesFor("wl-form")).toEqual([".wl-form { display: flex; flex-direction: column; gap: 2.25rem; }"]);
    expect(rulesFor("wl-row")).toEqual([".wl-row { display: flex; flex-direction: column; gap: 0.5rem; }"]);
    expect(rulesFor("wl-actions")).toEqual([
      ".wl-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 1rem; }",
    ]);
    expect(rulesFor("wl-notice")).toEqual([
      ".wl-help, .wl-notice { margin: 0; font-size: 1rem; line-height: 1.5; color: var(--site-block-muted, #4b5563); }",
      ".wl-notice a { color: var(--site-block-accent, #2563eb); text-underline-offset: 0.15em; }",
    ]);
    expect(rulesFor("wl-live")).toEqual([".wl-live { position: relative; }"]);
    expect(rulesFor("wl-button")).toEqual([
      ".wl-button { display: inline-flex; align-items: center; min-height: 48px; margin: 0; padding: 0.75rem 1.75rem; font: inherit; font-weight: 500; line-height: inherit; cursor: pointer; border: 0; border-radius: var(--site-block-radius, 0.375rem); background: var(--site-block-accent, #2563eb); color: var(--site-block-on-accent, #ffffff); transition: opacity var(--site-block-motion, 150ms); }",
      ".wl-button:hover { opacity: 0.9; }",
      ".wl-button:disabled { opacity: 0.5; cursor: default; }",
      "@media (prefers-reduced-motion: reduce) > .wl-button { transition: none; }",
    ]);
    expect(rulesFor("wl-fail")).toEqual([
      ".wl-field-error, .wl-fail { margin: 0; font-size: 1rem; line-height: 1.5; font-weight: 500; color: var(--site-block-danger, #b91c1c); }",
    ]);
    expect(rulesFor("wl-turnstile")).toEqual([".wl-turnstile { min-height: 65px; }"]);
  });

  test("notice, live region and button are the three children of .wl-actions, in that order", async () => {
    const childClasses = () =>
      [...document.querySelector(".wl-actions")!.children].map((el) => [...el.classList]);
    wrapper = mount(WaitlistForm, { props: { notice }, attachTo: document.body });
    expect(childClasses()).toEqual([["wl-notice"], ["wl-live"], ["wl-button"]]);
    wrapper.unmount();

    const send = vi.fn(async () => {
      throw new Error("down");
    });
    wrapper = mount(WaitlistForm, { props: { send }, attachTo: document.body });
    expect(childClasses()).toEqual([["wl-live"], ["wl-button"]]);
    await setEmail(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(childClasses()).toEqual([["wl-live"], ["wl-button"]]);
    expect(document.querySelector(".wl-actions .wl-live > p.wl-fail")).not.toBeNull();
  });

  test("the sending word is screen-reader only (.wl-sr is absolute, 1px, clipped)", () => {
    expect(style).toMatch(
      /\.wl-sr \{[\s\S]*?position: absolute;[\s\S]*?width: 1px;[\s\S]*?height: 1px;[\s\S]*?overflow: hidden;[\s\S]*?clip: rect\(0, 0, 0, 0\);[\s\S]*?\}/,
    );
  });

  test("the thank-you wrapper draws no outline on a mouse click: it has no :focus rule, only the shared :focus-visible", () => {
    expect(style).not.toMatch(/\.wl-sent:focus\b/);
    expect(style).toMatch(/\.wl :focus-visible,\s*\.wl-sent-heading:focus \{/);
  });

  test("two choice fields with the same value give different option ids, each carrying its field name", () => {
    const fields: WaitlistField[] = [
      { name: "plan", kind: "choice", label: "P", options: [{ value: "x", label: "X" }] },
      { name: "tier", kind: "choice", label: "T", options: [{ value: "x", label: "X" }] },
    ];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const ids = radios.map((el) => el.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.some((id) => id.endsWith("-option-plan-x"))).toBe(true);
    expect(ids.some((id) => id.endsWith("-option-tier-x"))).toBe(true);
    for (const radio of radios) {
      expect(radio.closest("label.wl-option")).not.toBeNull();
    }
    for (const label of document.querySelectorAll("label.wl-option")) {
      expect(label.hasAttribute("for")).toBe(false);
    }
    wrapper.unmount();
  });

  test("option ids keep a separator between the field and the value: field a + value bc and field ab + value c differ", () => {
    const fields: WaitlistField[] = [
      { name: "email", kind: "email", label: "Email", required: true },
      { name: "a", kind: "choice", label: "A", options: [{ value: "bc", label: "BC" }] },
      { name: "ab", kind: "choice", label: "AB", options: [{ value: "c", label: "C" }] },
    ];
    wrapper = mount(WaitlistForm, { props: { fields }, attachTo: document.body });
    const ids = [...document.querySelectorAll('input[type="radio"]')].map((el) => el.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    wrapper.unmount();
  });

  test("the widget's box is reserved at 65px", () => {
    expect(style).toMatch(/\.wl-turnstile \{ min-height: 65px; \}/);
  });

  test("the box exists with a key and is absent without one", () => {
    wrapper = mount(WaitlistForm, { props: { turnstileSiteKey: "k" }, attachTo: document.body });
    expect(document.querySelector(".wl-turnstile")).not.toBeNull();
    wrapper.unmount();
    wrapper = mount(WaitlistForm, { attachTo: document.body });
    expect(document.querySelector(".wl-turnstile")).toBeNull();
  });
});
