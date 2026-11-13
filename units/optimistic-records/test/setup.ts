// Test setup: React Testing Library is cleaned up after each test and the page is left as it was found.
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof window === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});
