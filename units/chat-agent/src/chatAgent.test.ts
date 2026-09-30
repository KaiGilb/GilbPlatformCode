import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_AGENT,
  agentStorageKey,
  loadChatAgent,
  parseChatAgentId,
  saveChatAgent,
  type AgentIdStore,
} from "./chatAgent";

function memory(): AgentIdStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

describe("parseChatAgentId", () => {
  it("accepts only the two exact ids", () => {
    expect(parseChatAgentId("Kai-Zen")).toBe("Kai-Zen");
    expect(parseChatAgentId("Jackfruit")).toBe("Jackfruit");
    expect(parseChatAgentId("kai-zen")).toBe(DEFAULT_CHAT_AGENT);
    expect(parseChatAgentId("Kai-Zen ")).toBe(DEFAULT_CHAT_AGENT);
    expect(parseChatAgentId(null)).toBe(DEFAULT_CHAT_AGENT);
    expect(parseChatAgentId("")).toBe(DEFAULT_CHAT_AGENT);
  });
});

describe("load and save", () => {
  it("does not read or write when the principal is blank, and does not trim", () => {
    const store = memory();
    expect(loadChatAgent("", store)).toBe("Jackfruit");
    saveChatAgent("", "Kai-Zen", store);
    expect(store.data.size).toBe(0);
    expect(agentStorageKey(" x")).toBe("baseapp.agent-chat.agent. x");
    expect(agentStorageKey("x")).not.toBe(agentStorageKey(" x"));
  });

  it("stores under the principal and reads an unknown value back as Jackfruit", () => {
    const store = memory();
    saveChatAgent("person-1", "Kai-Zen", store);
    expect(loadChatAgent("person-1", store)).toBe("Kai-Zen");
    expect(loadChatAgent("person-2", store)).toBe("Jackfruit");
    store.setItem(agentStorageKey("person-1"), "nope");
    expect(loadChatAgent("person-1", store)).toBe("Jackfruit");
  });

  it("treats a throwing store as Jackfruit on read and as a no-op on write", () => {
    const broken: AgentIdStore = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(loadChatAgent("person-1", broken)).toBe("Jackfruit");
    expect(() => saveChatAgent("person-1", "Kai-Zen", broken)).not.toThrow();
  });
});
