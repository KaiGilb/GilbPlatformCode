// Behaviour tests for the waiting-list form. New for this unit; the source had none of these.
import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { h } from "vue";
import axe from "axe-core";
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
  test("the form posts to actionUrl and every control has a name", () => {
    const actionUrl = "/elsewhere/join";
    wrapper = mount(WaitlistForm, { props: { actionUrl }, attachTo: document.body });
    const form = document.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe(actionUrl);
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
    expect(document.querySelector('[aria-live="polite"]')!.textContent!.trim()).toBe("");
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
