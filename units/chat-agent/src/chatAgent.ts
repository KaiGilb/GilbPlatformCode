/**
 * The chat picker: two ids, and the key under which the pick is stored for one principal.
 * The store is passed in. This file does not touch a browser store on its own.
 */

export const CHAT_AGENT_IDS = ["Jackfruit", "Kai-Zen"] as const;

export type ChatAgentId = (typeof CHAT_AGENT_IDS)[number];

export const DEFAULT_CHAT_AGENT: ChatAgentId = "Jackfruit";

export const CHAT_AGENTS: { id: ChatAgentId; label: string }[] = [
  { id: "Jackfruit", label: "Jackfruit" },
  { id: "Kai-Zen", label: "Kai-Zen" },
];

/** Exact match only. Anything else, including a blank or a different case, is Jackfruit. */
export function parseChatAgentId(raw: unknown): ChatAgentId {
  if (raw === "Kai-Zen" || raw === "Jackfruit") return raw;
  return DEFAULT_CHAT_AGENT;
}

/** The principal is not trimmed. An empty principal is still not a reason to build a key for a read. */
export function agentStorageKey(principal: string): string {
  return `baseapp.agent-chat.agent.${principal}`;
}

export interface AgentIdStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A blank principal does not read the store. A store that throws is Jackfruit. */
export function loadChatAgent(principal: string, store: AgentIdStore): ChatAgentId {
  if (!principal) return DEFAULT_CHAT_AGENT;
  try {
    return parseChatAgentId(store.getItem(agentStorageKey(principal)));
  } catch {
    return DEFAULT_CHAT_AGENT;
  }
}

/** A blank principal does not write. A store that throws is ignored. */
export function saveChatAgent(principal: string, id: ChatAgentId, store: AgentIdStore): void {
  if (!principal) return;
  try {
    store.setItem(agentStorageKey(principal), id);
  } catch {
    /* the in-memory pick still holds */
  }
}
