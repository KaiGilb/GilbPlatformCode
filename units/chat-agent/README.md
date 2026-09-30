# chat-agent

The two chat agents, and the key under which one principal's pick is stored.

## What this is

The ids are exactly `Jackfruit` and `Kai-Zen`. `DEFAULT_CHAT_AGENT` is `Jackfruit`. `CHAT_AGENTS` is the pair of `{ id, label }` rows, Jackfruit first.

`parseChatAgentId(raw)` returns the id only on exact equality. `kai-zen`, `Kai-Zen ` with a space, `""`, null, and any other value are `Jackfruit`. There is no error and no blank. The picker always has a value.

`agentStorageKey(principal)` is `baseapp.agent-chat.agent.` plus the principal. The principal is not trimmed. `" x"` and `"x"` are different keys.

`loadChatAgent(principal, store)` returns `Jackfruit` without reading when the principal is `""`. Otherwise it reads that key and parses the result. A store that throws is `Jackfruit`.

`saveChatAgent(principal, id, store)` does nothing when the principal is `""`. Otherwise it writes the id. A store that throws is ignored. The in-memory pick is the host's to keep.

The store is whatever you pass. The app passes `sessionStorage`, so the pick is for this tab, not a permanent preference. Do not pass `localStorage` and expect the app's behaviour.

## What this is not

- Not the chat panel, and not a call to an agent.
- Not a list you extend by pushing. A third id will not parse. It will load back as Jackfruit. Adding an agent means changing this closed set, on purpose.
- Not a vault record. The comment in the app says the list is the picker only.

## How to take it

Package: `@kaigilb/gilbplatformcode-chat-agent`

```ts
import {
  CHAT_AGENTS,
  loadChatAgent,
  saveChatAgent,
} from "@kaigilb/gilbplatformcode-chat-agent";

const selected = loadChatAgent(principal, sessionStorage);
saveChatAgent(principal, "Kai-Zen", sessionStorage);
```

Path: `units/chat-agent/`.

`AgentIdStore` is `getItem` and `setItem`. A `Storage` object satisfies it.

## Examples

```ts
parseChatAgentId("Kai-Zen"); // "Kai-Zen"
parseChatAgentId("kai-zen"); // "Jackfruit"
parseChatAgentId(null); // "Jackfruit"

agentStorageKey("person-1"); // "baseapp.agent-chat.agent.person-1"
```

A blank principal does not create a key in the store. Callers that have not signed in stay on Jackfruit and do not write a shared empty-principal row.

## What the host must supply

The principal string for the signed-in person, and the store. Use the same store for load and save. Use `sessionStorage` if you are matching the app.

## Do not

- Do not trim the principal before building the key if you need the same slot the app used. Load and save both refuse only `""`, not a string of spaces.
- Do not treat an unknown stored value as a third agent. It is Jackfruit.
- Do not show an empty picker. The parse result is never empty.
- Do not write the pick to the vault from this unit. It is a local picker memory.

## Wrong readings

- "Jackfruit means the stored value was Jackfruit." It also means the value was missing, unknown, or the store threw.
- "The key is per browser, forever." Only if you pass a store that works that way. The app's store does not.
- "A different case is close enough." It is not. The match is `===`.

## Where it came from

GilbApp `parseChatAgentId`, `agentStorageKey`, `loadChatAgent`, and `saveChatAgent` in `src/lib/base/chatAgents.ts`. The store argument is the app's `sessionStorage`, passed in so this unit does not touch a global store by itself.
