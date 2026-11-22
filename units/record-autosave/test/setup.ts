// Every test starts with an empty page: the rendered trees are unmounted and the body is cleared.
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof window !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    document.body.innerHTML = "";
  }
});
