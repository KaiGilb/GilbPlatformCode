// Adopted from Agent.Tester round 3 (report AgentTester-WebUnit-8aaf2ff-EngineA-bdbe4c7.md, 2026-10-18).
// Agent.Tester round 3 gap tests (web-units/section-menu @ 8aaf2ff), written in the QA scratch copy.
// They kill the two mutants that survive the unit's own 56 tests (M24, M30 in qa3-web/mutation.log).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3
// ("the same behaviour as the app menu": each opening starts from where you are; the phone sheet shows the
// section you are on).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import SectionMenu from "./SectionMenu.vue";
import type { WebMenu } from "./menu";

const MENU: WebMenu = {
  sections: [
    { id: "home", label: "Home", to: "/" },
    { id: "services", label: "Services", to: "/services", links: [{ id: "services.web", label: "Websites", to: "/services/websites" }] },
    { id: "blog", label: "Blog", to: "/blog", links: [{ id: "blog.tags", label: "Tags", to: "/blog/tag" }] },
  ],
};

let phone = false;
beforeEach(() => {
  phone = false;
  window.matchMedia = ((q: string) => ({
    matches: q.includes("max-width: 599") && phone,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});
const flush = async () => { await nextTick(); await nextTick(); await nextTick(); };
const shownId = () => document.querySelector("[data-previewing='true']")?.getAttribute("data-section");
const visibleList = () => document.querySelector(".sm-group.is-shown")?.getAttribute("data-list-for");
const trigger = () => document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!;
const section = (id: string) => document.querySelector<HTMLElement>(`[data-section="${id}"]`)!;

describe("QA3 gaps — web SectionMenu", () => {
  // Spec: §3 same behaviour as the app menu — "Each opening starts from the section you are on" (README, app unit `show`).
  test("a reopening starts from the section you are on, not the one last previewed", async () => {
    wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services/websites" }, attachTo: document.body });
    await flush();
    trigger().click();
    await flush();
    section("services").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await flush();
    expect(shownId()).toBe("blog");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    trigger().click();
    await flush();
    expect(shownId()).toBe("services");
    expect(visibleList()).toBe("services");
  });

  // Spec: §3 the phone sheet — on a phone the pages shown are those of the section you are on; the arrows move
  // focus but do not swap the column (the app unit: `shown = compact ? currentSection : …`).
  test("phone: the arrow keys move between sections but the pages shown stay those of your section", async () => {
    phone = true;
    wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services/websites" }, attachTo: document.body });
    await flush();
    trigger().click();
    await flush();
    section("services").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await flush();
    expect(document.activeElement).toBe(section("blog"));
    expect(visibleList()).toBe("services");
  });

  // Spec: §3 the phone sheet + "each opening starts from where you are". On a phone, focus on open does not
  // preview, so only show()'s reset brings the column back to your section after a page-less section was tapped.
  test("phone: after tapping a page-less section, a reopening shows your own section's pages again", async () => {
    phone = true;
    const menu: WebMenu = { sections: [...MENU.sections, { id: "more", label: "More", links: [{ id: "more.a", label: "A", to: "/a" }] }] };
    wrapper = mount(SectionMenu, { props: { menu, currentPath: "/services/websites" }, attachTo: document.body });
    await flush();
    trigger().click();
    await flush();
    section("more").click();
    await flush();
    expect(visibleList()).toBe("more");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    trigger().click();
    await flush();
    expect(visibleList()).toBe("services");
  });
});
