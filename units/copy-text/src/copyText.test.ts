import { describe, expect, it } from "vitest";
import { browserClipboard, copyText } from "./copyText";

describe("copyText", () => {
  it("returns copied when writeText resolves", async () => {
    let received = "";
    const result = await copyText("abc", {
      writeText(text) {
        received = text;
        return Promise.resolve();
      },
    });
    expect(result).toBe("copied");
    expect(received).toBe("abc");
  });

  it("returns copied when writeText is synchronous", async () => {
    const result = await copyText("abc", { writeText() { /* no promise */ } });
    expect(result).toBe("copied");
  });

  it("returns denied when writeText rejects", async () => {
    const result = await copyText("abc", {
      writeText() {
        return Promise.reject(new Error("blocked"));
      },
    });
    expect(result).toBe("denied");
  });

  it("returns denied when writeText throws", async () => {
    const result = await copyText("abc", {
      writeText() {
        throw new Error("blocked");
      },
    });
    expect(result).toBe("denied");
  });

  it("returns unavailable when there is no clipboard", async () => {
    expect(await copyText("abc", null)).toBe("unavailable");
    expect(await copyText("abc", undefined)).toBe("unavailable");
    expect(await copyText("abc", {})).toBe("unavailable");
  });

  it("still writes an empty string", async () => {
    let received: string | null = null;
    const result = await copyText("", {
      writeText(text) {
        received = text;
      },
    });
    expect(result).toBe("copied");
    expect(received).toBe("");
  });
});

describe("browserClipboard", () => {
  it("returns null in a runtime with no clipboard", () => {
    expect(browserClipboard()).toBeNull();
  });
});
