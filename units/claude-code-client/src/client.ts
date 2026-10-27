// gilb-claude-code, page side. The person's own Claude Code, on their own computer, as an app's agent.
//
// A small local bridge (bridge/bridge.mjs) runs the person's official `claude` CLI on their Claude subscription. This
// module is the page's side of it. It knows nothing about any one app: the app hands in what it has (its platform
// origin, how it signs a request, where to keep the secret) and gets back a client.
//
//   pair     the person types the short code the bridge printed in their terminal; the bridge answers with a secret.
//            The secret is kept in localStorage (this origin only: every tab and browser restart shares it), keyed by the
//            signed-in principal. The bridge keeps it too (hashed) until Disconnect, a 401, or 30 idle days.
//            ⛔ Nothing is written to any vault, and the secret is never sent anywhere but the bridge on the person's own computer.
//   a turn   1. GilbPlatform composes the turn: system prompt (+ the picked agent's standing instructions) and the tool
//               list (POST <platformOrigin>/base/ai/claude-code/context).
//            2. The bridge runs Claude Code with them and streams back. When Claude Code calls a vault tool, the bridge
//               asks THIS page to run it: the page calls GilbPlatform (POST <platformOrigin>/base/ai/claude-code/tool)
//               with the app's own sign-in, as the person, and hands the answer back. The bridge never holds a
//               GilbPlatform credential, and ⛔ no Claude credential is ever seen here.

export const CLAUDE_CODE_PROVIDER = "claude-code" as const;

/** What the bridge says on `/v1/hello`. */
const BRIDGE_NAME = "gilb-claude-code-bridge";

/** The bridge could not be reached, refused, or failed a turn. `status` 0 = not reachable on this computer. */
export class ClaudeCodeBridgeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ClaudeCodeBridgeError";
    this.status = status;
  }
}

/** GilbPlatform refused or could not answer the turn's context request (the tool calls report their errors to the model instead). */
export class ClaudeCodePlatformError extends Error {
  readonly status: number;
  /** The body's `error` token when it sent one, else undefined. */
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ClaudeCodePlatformError";
    this.status = status;
    this.code = code;
  }
}

export interface ClaudeCodeTurn {
  role: "user" | "assistant";
  content: string;
  model?: string;
  payer?: string;
}

export interface ClaudeCodeReply {
  role: "assistant";
  content: string;
  model: string;
  payer: "person-claude-code";
}

/** What the page tells the app while a turn runs. `standing` carries the platform's raw report; the app reads it as it likes. */
export type ClaudeCodeStreamEvent =
  | { event: "start"; data: { ok: true } }
  | { event: "tool"; data: { name: string; ok: boolean } }
  | { event: "standing"; data: unknown };

export interface ClaudeCodeConnection {
  provider: typeof CLAUDE_CODE_PROVIDER;
  secret: string;
  connected_at: number;
}

export interface ClaudeCodeReadback {
  provider: typeof CLAUDE_CODE_PROVIDER;
  connected: true;
  connected_at: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export interface ClaudeCodeClientConfig {
  /** Who is signed in. The pairing secret is stored per principal. An empty principal is "nobody": nothing connects. */
  principal: string;
  /** The GilbPlatform origin the app talks to, e.g. `https://platform.example.test`. The two routes below it are fixed. */
  platformOrigin: string;
  /**
   * The app's own request signing for GilbPlatform: the headers (`authorization`, `dpop`, ...) for ONE request.
   * The page calls this per request, so a DPoP proof is bound to that method and URL.
   */
  getAuthHeaders: (method: string, url: string) => Promise<Record<string, string>> | Record<string, string>;
  /** Called when GilbPlatform answers 401 so the app can drop its cached proof/token before the one retry. */
  invalidateAuth?: () => void;
  /** REQUIRED. Where the bridge listens on the person's own computer: the loopback URL the host app passes in. */
  bridgeUrl: string;
  /** Default `globalThis.localStorage` (per origin, shared by tabs and restarts). The secret never leaves this origin. */
  storage?: StorageLike;
  /** Prefix for the storage keys. Default `gilb`. */
  storageNamespace?: string;
  /** The command the person is told to run when no bridge answers. A function is called at the moment of the message. */
  startCommand?: string | (() => string);
  /** Turns a failed response into a sentence. Default reads `message`/`error` from the body. */
  errorText?: (status: number, body: unknown, fallback: string) => string;
}

export interface SendClaudeCodeOpts {
  /** Names the thread (the agent or own-agent entry) so its Claude Code session is kept apart. */
  thread: string;
  /** Vaults already selected in the app (`contentVaultIds`). Only `http…` ids are sent. */
  contentVaultIds?: string[];
  /** Picker id of a platform agent. */
  agent?: string;
  /** An own agent's entry URI. When set, sent instead of `agent`. */
  agentEntry?: string;
  onEvent?: (ev: ClaudeCodeStreamEvent) => void;
  /**
   * Told, for the turn and for each hand-off's nested turn, what the CLI itself says it runs with. `apiKeySource` is
   * "none" on a subscription; the bridge stops any run that says otherwise.
   */
  onBridgeStatus?: (status: { nested: boolean; apiKeySource: string | null; model: string }) => void;
}

/** What `/base/ai/claude-code/tool` answers when the tool is a hand-off: a nested turn for THIS page to run on the person's Claude Code. */
export interface ClaudeCodeHop {
  id: string;
  via: string;
  role: string;
  task: string;
  system: string;
  tools: unknown[];
  /** The tool answer's fixed part (role, procedures, standing outcome). The nested turn's final text is added as `content`. */
  answer: Record<string, unknown>;
}

export interface ClaudeCodeClient {
  readonly principal: string;
  readonly bridgeUrl: string;
  /** True when a bridge answers on this computer. Does not need the secret. */
  probe(): Promise<boolean>;
  /** Trades the code printed in the bridge's terminal for a secret and keeps it for this tab. Wrong code -> 401 with the bridge's own sentence. */
  pair(code: string): Promise<ClaudeCodeReadback>;
  /** Trades the code for a secret and returns it WITHOUT keeping it (for an app that stores it itself). */
  requestSecret(code: string): Promise<string>;
  save(secret: string): ClaudeCodeConnection;
  load(): ClaudeCodeConnection | null;
  /** Connected read-back for the UI. ⛔ Does not expose the secret. */
  readConnected(): ClaudeCodeReadback | null;
  /** Forget the secret here and, best effort, ask the bridge to forget it too. */
  disconnect(): void;
  /** Sends the thread to the person's Claude Code and returns the assistant turn. */
  sendTurn(messages: ClaudeCodeTurn[], opts: SendClaudeCodeOpts): Promise<ClaudeCodeReply>;
}

const DISCONNECTED = "Claude Code was disconnected, so the turn was stopped.";

/** What the page says to the model that asked for a hand-off that could not finish. */
const HAND_OFF_FAILED_NEXT =
  "Do not call this hand-off again with the same Agent. Tell the person which Agent could not take the work, and why.";

interface BridgeTurnOut {
  content: string;
  model: string;
  sessionId: string | undefined;
}

interface SseEvent {
  event: string;
  data: unknown;
}

async function* readBridgeSse(res: Response): AsyncGenerator<SseEvent> {
  const reader = res.body?.getReader();
  if (!reader) throw new ClaudeCodeBridgeError(502, "The bridge returned an unexpected answer.");
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        let event = "message";
        const data: string[] = [];
        for (const raw of part.split("\n")) {
          const line = raw.replace(/\r$/, "");
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
        if (data.length === 0) continue;
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(data.join("\n"));
        } catch {
          parsed = { message: data.join("\n") };
        }
        yield { event, data: parsed };
      }
      if (done) break;
    }
  } finally {
    // The caller stopped reading (an error mid-turn): close the stream so the bridge sees the page leave and ends the turn.
    reader.cancel().catch(() => undefined);
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function toolAnswerOk(result: string): boolean {
  try {
    const v = JSON.parse(result) as unknown;
    return !(v && typeof v === "object" && "error" in v);
  } catch {
    return true;
  }
}

function transcriptOf(turns: ClaudeCodeTurn[]): string {
  return turns.map((t) => `${t.role === "user" ? "Person" : "Agent"}: ${t.content}`).join("\n\n");
}

/** A fresh id for one person turn. GilbPlatform keeps the turn's limits (rounds, mint caps, open hand-offs) under it. */
function newTurnId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function defaultErrorText(status: number, body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { message?: unknown; error?: unknown };
    for (const v of [b.message, b.error]) if (typeof v === "string" && /\s/.test(v.trim())) return v;
  }
  return `${fallback} (HTTP ${status}).`;
}

/**
 * Builds the page-side client for ONE signed-in principal. Make a new one when the principal changes.
 *
 * A hand-off the model asks for (run_named_role, ask_agent_concept) comes back from GilbPlatform as a `hop`: the Agent's
 * composed prompt and its tools. It runs here as a nested turn on the SAME bridge, so on the person's own Claude Code and
 * subscription; its tool calls go to GilbPlatform with the hop's id; its final text is the hand-off's answer. GilbPlatform
 * makes no model call for it, and no key of anyone is involved.
 */
export function createClaudeCodeClient(config: ClaudeCodeClientConfig): ClaudeCodeClient {
  const { principal } = config;
  if (typeof config.bridgeUrl !== "string" || config.bridgeUrl === "") {
    throw new Error("createClaudeCodeClient: bridgeUrl is required (the URL the bridge listens on, on the person's own computer).");
  }
  const bridgeUrl = config.bridgeUrl.replace(/\/+$/, "");
  const platform = config.platformOrigin.replace(/\/+$/, "");
  const contextUrl = `${platform}/base/ai/claude-code/context`;
  const toolUrl = `${platform}/base/ai/claude-code/tool`;
  const ns = config.storageNamespace ?? "gilb";
  const errorText = config.errorText ?? defaultErrorText;
  /** SHA-256 hex of the principal, so the bridge can tell pairings apart without learning who signed in. "" when unavailable. */
  async function hashPrincipal(p: string): Promise<string> {
    try {
      const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(p));
      return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  }
  const store = (): StorageLike | null => {
    try {
      return config.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    } catch {
      return null;
    }
  };
  const storageKey = `${ns}.claude-code-bridge.${principal}`;
  const sessionPrefix = `${ns}.claude-code-session.${principal}.`;

  const notRunning = () => {
    const cmd = typeof config.startCommand === "function" ? config.startCommand() : config.startCommand;
    return cmd
      ? `The Claude Code bridge is not reachable on this computer. Start it in Terminal with: ${cmd}`
      : "The Claude Code bridge is not reachable on this computer. Start it with the command shown under Connect > Claude Code.";
  };

  async function bridgeFetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${bridgeUrl}${path}`, init);
    } catch {
      if (init.signal?.aborted) throw new ClaudeCodeBridgeError(499, DISCONNECTED);
      throw new ClaudeCodeBridgeError(0, notRunning());
    }
  }

  async function postPlatform(url: string, payload: unknown): Promise<Response> {
    const send = async () =>
      fetch(url, {
        method: "POST",
        headers: {
          ...(await config.getAuthHeaders("POST", url)),
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    let res = await send();
    if (res.status === 401) {
      config.invalidateAuth?.();
      res = await send();
    }
    if (res.status === 401) {
      config.invalidateAuth?.();
      throw new ClaudeCodePlatformError(401, "Your session needs to re-authorize — try again.");
    }
    return res;
  }

  /** The bridge requests of turns that are running now, so Disconnect can stop them at once. */
  const inflight = new Set<AbortController>();

  async function runTurn(messages: ClaudeCodeTurn[], opts: SendClaudeCodeOpts, signal: AbortSignal): Promise<ClaudeCodeReply> {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") throw new ClaudeCodePlatformError(400, "Write a message first.");
    const conn = client.load();
    if (!conn) throw new ClaudeCodeBridgeError(401, "Claude Code is not connected. Press Connect.");

    const vaults = (opts.contentVaultIds ?? []).map((id) => id.trim()).filter((id) => id.startsWith("http"));
    const turnFields: Record<string, unknown> = { userText: last.content, turnId: newTurnId() };
    if (vaults.length > 0) turnFields.contentVaultIds = vaults;
    const agentEntry = opts.agentEntry?.trim();
    if (agentEntry) turnFields.agentEntry = agentEntry;
    else if (opts.agent?.trim()) turnFields.agent = opts.agent.trim();

    /** The bridge does not know our secret any more (it was reset, expired the pairing, or another tab disconnected): forget it, and say so. */
    const bridgeForgotUs = (): ClaudeCodeBridgeError => {
      try {
        store()?.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      return new ClaudeCodeBridgeError(401, "The bridge no longer knows this pairing. Press Connect and enter its new code.");
    };

    /**
     * Runs ONE turn on the bridge (the person's turn, or a hand-off's nested turn when `parentTurnId` is set) and relays
     * its tool calls to `onTool` until it ends. The same loop for both, so a nested turn is exactly a turn.
     */
    async function streamBridgeTurn(
      body: Record<string, unknown>,
      onTool: (name: string, args: string, bridgeTurnId: string) => Promise<{ result: string; isError: boolean }>,
      announceStart: boolean,
      onStatus?: (data: { apiKeySource: string | null; model: string }) => void,
    ): Promise<BridgeTurnOut> {
      const res = await bridgeFetch("/v1/turn", {
        signal,
        method: "POST",
        headers: { "content-type": "application/json", "x-bridge-secret": conn!.secret },
        body: JSON.stringify(body),
      });
      if (res.status === 401) throw bridgeForgotUs();
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new ClaudeCodeBridgeError(res.status, typeof err?.error === "string" ? err.error : "The bridge could not run the turn.");
      }
      let turnId = "";
      let out: BridgeTurnOut | null = null;
      let streamError: string | null = null;
      try {
        for await (const ev of readBridgeSse(res)) {
          const data = (ev.data ?? {}) as Record<string, unknown>;
          if (ev.event === "start") {
            turnId = typeof data.turnId === "string" ? data.turnId : "";
            if (announceStart) opts.onEvent?.({ event: "start", data: { ok: true } });
          } else if (ev.event === "status") {
            onStatus?.({ apiKeySource: typeof data.apiKeySource === "string" ? data.apiKeySource : null, model: typeof data.model === "string" ? data.model : "" });
          } else if (ev.event === "tool_request") {
            const id = String(data.id ?? "");
            const name = String(data.name ?? "tool");
            const args = typeof data.arguments === "string" ? data.arguments : "{}";
            const answer = await onTool(name, args, turnId);
            const back = await bridgeFetch("/v1/tool-result", {
              signal,
              method: "POST",
              headers: { "content-type": "application/json", "x-bridge-secret": conn!.secret },
              body: JSON.stringify({ turnId, id, result: answer.result, isError: answer.isError }),
            });
            // The bridge did not take the answer (restarted, disconnected, or the turn is gone): it would wait for it
            // for 15 minutes. Stop here instead; leaving the stream (see readBridgeSse) ends the turn on the bridge.
            if (back.status === 401) throw bridgeForgotUs();
            if (!back.ok) throw new ClaudeCodeBridgeError(back.status, "The bridge did not take the tool's answer, so the turn was stopped. Try again.");
          } else if (ev.event === "message") {
            const content = typeof data.content === "string" ? data.content.trim() : "";
            if (content) {
              out = {
                content,
                model: typeof data.model === "string" ? data.model : "",
                sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined,
              };
            }
          } else if (ev.event === "error") {
            streamError = typeof data.message === "string" ? data.message : "Claude Code could not answer.";
          }
        }
      } catch (err) {
        // Disconnect aborted the read: say so, not "the bridge returned something unexpected".
        if (signal.aborted) throw new ClaudeCodeBridgeError(499, DISCONNECTED);
        throw err;
      }
      if (streamError) throw new ClaudeCodeBridgeError(502, streamError);
      if (!out) throw new ClaudeCodeBridgeError(502, "Claude Code returned no answer.");
      return out;
    }

    // 1. What makes this the platform's agent: the composed prompt and the tools.
    const ctxRes = await postPlatform(contextUrl, turnFields);
    const ctxBody = await readJson(ctxRes);
    if (!ctxRes.ok) {
      const code = ctxBody && typeof ctxBody === "object" ? (ctxBody as { error?: unknown }).error : undefined;
      throw new ClaudeCodePlatformError(
        ctxRes.status,
        errorText(ctxRes.status, ctxBody, "The agent could not answer"),
        typeof code === "string" ? code : undefined,
      );
    }
    const ctx = ctxBody as { system?: unknown; tools?: unknown; standing?: unknown };
    if (typeof ctx.system !== "string" || !Array.isArray(ctx.tools)) {
      throw new ClaudeCodePlatformError(502, "The agent returned an unexpected answer.");
    }
    if (ctx.standing !== undefined && ctx.standing !== null) opts.onEvent?.({ event: "standing", data: ctx.standing });

    /** One tool call of the person's turn (hopId unset) or of a hand-off's nested turn (hopId set), run on GilbPlatform as the person. */
    const callTool = async (
      name: string,
      args: string,
      hopId: string | undefined,
      bridgeTurnId: string,
    ): Promise<{ result: string; isError: boolean }> => {
      let result: string;
      let isError = false;
      try {
        const tr = await postPlatform(toolUrl, { ...turnFields, name, arguments: args, ...(hopId ? { hop: { id: hopId } } : {}) });
        const body = await readJson(tr);
        if (!tr.ok) {
          isError = true;
          result = JSON.stringify({ error: errorText(tr.status, body, `${name} could not run`) });
        } else {
          const b = body && typeof body === "object" ? (body as { result?: unknown; hop?: unknown }) : {};
          if (b.hop && typeof b.hop === "object" && !hopId) {
            // A hand-off: GilbPlatform prepared it; the model runs here, on the person's own Claude Code.
            const done = await runHop(b.hop as ClaudeCodeHop, bridgeTurnId);
            result = done.result;
            isError = done.isError;
          } else {
            const r = b.result;
            result = typeof r === "string" ? r : JSON.stringify({ error: `${name} returned an unexpected answer.` });
            isError = !toolAnswerOk(result);
          }
        }
      } catch (err) {
        isError = true;
        result = JSON.stringify({ error: err instanceof Error ? err.message : `${name} could not run` });
      }
      opts.onEvent?.({ event: "tool", data: { name, ok: !isError } });
      return { result, isError };
    };

    /** Runs a hand-off as a nested turn and answers the tool call that asked for it. */
    const runHop = async (hop: ClaudeCodeHop, parentTurnId: string): Promise<{ result: string; isError: boolean }> => {
      if (typeof hop.id !== "string" || typeof hop.system !== "string" || typeof hop.task !== "string" || !Array.isArray(hop.tools)) {
        return { result: JSON.stringify({ error: "The hand-off returned an unexpected answer.", next: HAND_OFF_FAILED_NEXT }), isError: true };
      }
      // However the nested turn ends (or never starts), its id stops working on GilbPlatform once its answer goes back to the asking turn.
      const closeHop = async () => {
        try {
          await postPlatform(toolUrl, { ...turnFields, name: "hop_done", arguments: "{}", hop: { id: hop.id, done: true } });
        } catch {
          // Best effort: an id that is never closed still expires on the server.
        }
      };
      // A hand-off is a nested turn OF a running turn. Without that turn's id it would open as a turn of its own, linked to nothing.
      if (!parentTurnId) {
        await closeHop();
        return { result: JSON.stringify({ error: "The hand-off could not be linked to its turn.", next: HAND_OFF_FAILED_NEXT }), isError: true };
      }
      try {
        const done = await streamBridgeTurn(
          { prompt: hop.task, system: hop.system, tools: hop.tools, parentTurnId },
          (name, args) => callTool(name, args, hop.id, ""),
          false,
          (d) => opts.onBridgeStatus?.({ nested: true, ...d }),
        );
        await closeHop();
        return { result: JSON.stringify({ ...hop.answer, content: done.content }), isError: false };
      } catch (err) {
        await closeHop();
        return {
          result: JSON.stringify({
            error: "the Agent's run failed",
            role: hop.role,
            reason: err instanceof Error ? err.message : "the hand-off could not run",
            next: HAND_OFF_FAILED_NEXT,
          }),
          isError: true,
        };
      }
    };

    // 2. The turn, on the person's computer. A session is reused only when it already covers the thread before this message.
    const skey = `${sessionPrefix}${opts.thread}`;
    let sessionId: string | undefined;
    try {
      const kept = JSON.parse(store()?.getItem(skey) ?? "null") as { sessionId?: string; covers?: number } | null;
      if (kept && typeof kept.sessionId === "string" && kept.covers === messages.length - 1) sessionId = kept.sessionId;
    } catch {
      sessionId = undefined;
    }
    const earlier = messages.slice(0, -1);
    const out = await streamBridgeTurn(
      {
        prompt: last.content,
        history: earlier.length > 0 ? transcriptOf(earlier) : "",
        system: ctx.system,
        tools: ctx.tools,
        ...(sessionId ? { sessionId } : {}),
      },
      (name, args, bridgeTurnId) => callTool(name, args, undefined, bridgeTurnId),
      true,
      (d) => opts.onBridgeStatus?.({ nested: false, ...d }),
    );
    if (out.sessionId) {
      try {
        store()?.setItem(skey, JSON.stringify({ sessionId: out.sessionId, covers: messages.length + 1 }));
      } catch {
        /* quota */
      }
    }
    return { role: "assistant", content: out.content, model: out.model, payer: "person-claude-code" };
  }

  const client: ClaudeCodeClient = {
    principal,
    bridgeUrl,

    async probe() {
      try {
        const res = await fetch(`${bridgeUrl}/v1/hello`, { method: "GET" });
        if (!res.ok) return false;
        const body = (await res.json()) as { bridge?: unknown };
        return body.bridge === BRIDGE_NAME;
      } catch {
        return false;
      }
    },

    async requestSecret(code) {
      const principalHash = await hashPrincipal(principal);
      const res = await bridgeFetch("/v1/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(principalHash ? { code: code.trim(), principalHash } : { code: code.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { secret?: unknown; error?: unknown } | null;
      if (!res.ok || !body || typeof body.secret !== "string" || !body.secret) {
        throw new ClaudeCodeBridgeError(
          res.status,
          typeof body?.error === "string" && body.error ? body.error : "The bridge did not accept that code.",
        );
      }
      return body.secret;
    },

    save(secret) {
      const stored: ClaudeCodeConnection = { provider: CLAUDE_CODE_PROVIDER, secret, connected_at: Date.now() };
      try {
        store()?.setItem(storageKey, JSON.stringify(stored));
      } catch {
        /* quota — the caller still has `stored` */
      }
      return stored;
    },

    async pair(code) {
      const secret = await client.requestSecret(code);
      const stored = client.save(secret);
      return { provider: stored.provider, connected: true, connected_at: stored.connected_at };
    },

    load() {
      if (!principal) return null;
      try {
        const raw = store()?.getItem(storageKey);
        if (!raw) return null;
        const row = JSON.parse(raw) as Record<string, unknown>;
        if (!row || typeof row.secret !== "string" || !row.secret) return null;
        return {
          provider: CLAUDE_CODE_PROVIDER,
          secret: row.secret,
          connected_at: typeof row.connected_at === "number" ? row.connected_at : 0,
        };
      } catch {
        return null;
      }
    },

    readConnected() {
      const stored = client.load();
      return stored ? { provider: CLAUDE_CODE_PROVIDER, connected: true, connected_at: stored.connected_at } : null;
    },

    disconnect() {
      for (const ctl of inflight) ctl.abort();
      const stored = client.load();
      try {
        const s = store();
        if (s) {
          s.removeItem(storageKey);
          for (let i = s.length - 1; i >= 0; i--) {
            const k = s.key(i);
            if (k && k.startsWith(sessionPrefix)) s.removeItem(k);
          }
        }
      } catch {
        /* ignore */
      }
      if (stored) {
        void fetch(`${bridgeUrl}/v1/unpair`, {
          method: "POST",
          headers: { "x-bridge-secret": stored.secret },
          keepalive: true, // still sent if the page unloads right after Disconnect
        }).catch(() => undefined);
      }
    },

    sendTurn(messages, opts) {
      const ctl = new AbortController();
      inflight.add(ctl);
      return runTurn(messages, opts, ctl.signal).finally(() => inflight.delete(ctl));
    },
  };
  return client;
}
