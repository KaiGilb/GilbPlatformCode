// Adopted from Agent.Tester's R1 claim tests (report AgentTester-R1-WebUnits-1afcb32-EngineA-b49b8de.md, D1, 2026-10-19).
// R1 asserted the old words and failed; the words were fixed (D1), so these now assert the documented rule.
import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ContactForm from "./ContactForm.vue";
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });
async function sendWith(body: string, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
  const w = mount(ContactForm, { attachTo: document.body });
  const [n, e] = w.findAll("input");
  await n!.setValue("Ana"); await e!.setValue("ana@example.test"); await w.find("textarea").setValue("Hi");
  await w.find("form").trigger("submit"); await flushPromises();
  const r = document.querySelector(".cf-ok") ? "sent" : document.querySelector(".cf-error") ? "error" : "none";
  w.unmount();
  return r;
}
describe("QA R1 ContactForm answer rule as documented", () => {
  // Spec (claim): "a sent line when the address answers with a 2xx whose body is not empty and is not a falsy
  // JSON value (false, 0, null, ""), an error line otherwise" (ContactForm.vue JSDoc, README "What this is").
  test.each(["false", "0", "null", '""'])("a 2xx with the falsy JSON body %s shows the error line, as the README says", async (body) => {
    expect(await sendWith(body)).toBe("error");
  });
  test.each(['{"ok":true}', "true", "1", '"sent"'])("a 2xx with the truthy body %s shows the sent line", async (body) => {
    expect(await sendWith(body)).toBe("sent");
  });
});
