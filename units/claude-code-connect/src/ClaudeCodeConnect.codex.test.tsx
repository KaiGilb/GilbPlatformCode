/**
 * Connect 0.2.0, Codex setup. The client is a real one with the methods under test replaced.
 * Spec: Chat.CodexConnect.PagePart.Units — the Codex connect view and the relay name.
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  bridgeCommands,
  CLAUDE_CODE_PROVIDER,
  createClaudeCodeClient,
  type BridgeEngine,
  type ClaudeCodeClient,
  type ClaudeCodeReadback,
} from "@kaigilb/gilbplatformcode-claude-code-client";
import { ClaudeCodeConnect, ClaudeCodeRelayButton } from "./index";

const commands = bridgeCommands({ origin: "https://app.example.com", basePath: "/", allowOrigin: "https://app.example.com" });
const READBACK: ClaudeCodeReadback = { provider: CLAUDE_CODE_PROVIDER, connected: true, connected_at: 9 };

function baseClient(): ClaudeCodeClient {
  return createClaudeCodeClient({
    principal: "https://p.example/base",
    platformOrigin: "https://platform.example",
    bridgeUrl: "http://127.0.0.1:47821",
    getAuthHeaders: async () => ({}),
  });
}

function codexEngine(over: Partial<BridgeEngine> = {}): BridgeEngine {
  return {
    id: "codex",
    name: "Codex",
    installed: true,
    version: "0.167.2",
    supported: true,
    account: "chatgpt",
    ready: true,
    billing: "chatgpt-subscription",
    models: [{ id: "gpt-fake-a", label: "Fake A", default: true, efforts: ["low", "high"] }],
    efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    codeTurns: false,
    images: false,
    delegateCoding: false,
    ...over,
  };
}

function hello(engines?: BridgeEngine[]): Awaited<ReturnType<ClaudeCodeClient["bridgeInfo"]>> {
  return {
    reachable: true,
    build: "0.4.0",
    codeTurns: false,
    workspace: false,
    codeMode: null,
    access: null,
    ...(engines ? { engines } : {}),
  };
}

/** A paired client whose hello the test controls. Pairing itself is not under test. */
function codexClient(info: () => Promise<Awaited<ReturnType<ClaudeCodeClient["bridgeInfo"]>>> | Awaited<ReturnType<ClaudeCodeClient["bridgeInfo"]>>) {
  const c = baseClient();
  c.probe = async () => true;
  c.pair = async () => READBACK;
  c.bridgeInfo = () => Promise.resolve(info());
  return c;
}

function alreadyPaired(c: ClaudeCodeClient) {
  c.load = () => ({ provider: CLAUDE_CODE_PROVIDER, secret: "kept", connected_at: READBACK.connected_at });
  c.readConnected = () => READBACK;
}

describe("ClaudeCodeConnect codex", () => {
  describe("step 1", () => {
    test("each tab names Codex after Node.js, and the rendered text names no host", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — Codex step 1 on Mac, Windows and Linux.
      const user = userEvent.setup();
      const { container } = render(
        <ClaudeCodeConnect
          engine="codex"
          relayBrowser={false}
          client={baseClient()}
          commands={commands}
          supportEmail="help@example.com"
          notYetBrowsers={["Firefox"]}
          onConnected={() => {}}
        />,
      );
      const tabs = [
        { id: "mac", place: "Terminal" },
        { id: "windows", place: "PowerShell" },
        { id: "linux", place: "terminal" },
      ] as const;
      for (const { id, place } of tabs) {
        await user.click(screen.getByTestId(`claude-code-tab-${id}`));
        const text = container.textContent ?? "";
        // Spec: Chat.CodexConnect UX-4 — the install line has no comma after Codex (meter: the rendered text contains that sentence)
        expect(text).toContain(`Codex signed in with your ChatGPT subscription. Install it once in ${place}:`);
        expect(screen.getByTestId("codex-install")).toHaveTextContent("npm install -g @openai/codex");
        expect(screen.getByRole("button", { name: "Copy install command" })).toBeInTheDocument();
        expect(text).toContain("Then sign in:");
        expect(screen.getByTestId("codex-login")).toHaveTextContent("codex login");
        expect(screen.getByRole("button", { name: "Copy sign-in command" })).toBeInTheDocument();
        expect(screen.getByTestId("codex-signin-note")).toHaveTextContent(
          "Choose Sign in with ChatGPT. This app runs Codex only on your ChatGPT sign-in, never on an API key.",
        );
        expect(text).toContain("It is billed to your ChatGPT subscription, and your turns stay on your computer.");
        const list = container.querySelector(".gcc-list")?.innerHTML ?? "";
        const nodeAt = list.indexOf("claude-code-node-check");
        const codexAt = list.indexOf("codex-install");
        expect(nodeAt).toBeGreaterThanOrEqual(0);
        expect(codexAt).toBeGreaterThan(nodeAt);
        const hostName = "Gilb" + "App";
        expect(text).not.toContain("Claude");
        expect(text).not.toContain(hostName);
        expect(container.innerHTML).not.toContain("Claude");
        expect(container.innerHTML).not.toContain(hostName);
        expect(container.querySelector('a[href="https://code.claude.com/docs/en/setup"]')).toBeNull();
        if (id === "mac") {
          expect(text).toContain("Firefox cannot connect to Codex yet.");
          expect(text).toContain("In Safari, Codex works through a small bridge window");
        }
        if (id === "windows") {
          expect(screen.getByTestId("claude-code-windows-request")).toHaveAttribute("href", "mailto:help@example.com?subject=Codex%20on%20Windows");
        }
      }
    });

    test("the default engine renders no Codex", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — Claude's setup is unchanged.
      const user = userEvent.setup();
      const c = baseClient();
      const info = vi.spyOn(c, "bridgeInfo");
      const { container } = render(<ClaudeCodeConnect relayBrowser={false} client={c} commands={commands} onConnected={() => {}} />);
      for (const id of ["mac", "windows", "linux"]) {
        await user.click(screen.getByTestId(`claude-code-tab-${id}`));
        expect(container.textContent ?? "").not.toContain("Codex");
        expect(container.innerHTML).not.toContain("Codex");
      }
      expect(info).not.toHaveBeenCalled();
    });
  });

  describe("readiness", () => {
    test("after pairing with a ready codex entry, onConnected is called once", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — a ready codex entry finishes the setup.
      const user = userEvent.setup();
      const c = codexClient(() => hello([codexEngine({ ready: true })]));
      const onConnected = vi.fn();
      const { container } = render(<ClaudeCodeConnect engine="codex" relayBrowser={false} client={c} commands={commands} onConnected={onConnected} />);
      await user.click(screen.getByRole("button", { name: /I've started it/ }));
      await user.type(await screen.findByLabelText("Code from the bridge terminal"), "K7F-29Q");
      await user.click(screen.getByRole("button", { name: "Pair" }));
      await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
      expect(onConnected).toHaveBeenCalledWith(READBACK);
      expect(container.textContent ?? "").toBe("");
    });

    test("a not-ready reason is shown, and Check again calls onConnected once it is ready", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — not ready shows the bridge's reason.
      const user = userEvent.setup();
      const reason = "Codex is not installed on this computer.";
      let ready = false;
      const reads: number[] = [];
      const c = codexClient(() => {
        reads.push(1);
        return hello([codexEngine({ ready, ...(ready ? {} : { reason }) })]);
      });
      const onConnected = vi.fn();
      render(<ClaudeCodeConnect engine="codex" relayBrowser={false} client={c} commands={commands} onConnected={onConnected} />);
      await user.click(screen.getByRole("button", { name: /I've started it/ }));
      await user.type(await screen.findByLabelText("Code from the bridge terminal"), "K7F-29Q");
      await user.click(screen.getByRole("button", { name: "Pair" }));
      expect(await screen.findByTestId("codex-state")).toHaveTextContent(reason);
      expect(onConnected).not.toHaveBeenCalled();
      ready = true;
      await user.click(screen.getByTestId("codex-check-again"));
      await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
      expect(onConnected).toHaveBeenCalledWith(READBACK);
      expect(reads.length).toBe(2);
    });

    test("checking with no reason shows the checking sentence", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — checking and no reason.
      const user = userEvent.setup();
      const c = codexClient(() => hello([codexEngine({ ready: false, checking: true })]));
      const onConnected = vi.fn();
      render(<ClaudeCodeConnect engine="codex" relayBrowser={false} client={c} commands={commands} onConnected={onConnected} />);
      await user.click(screen.getByRole("button", { name: /I've started it/ }));
      await user.type(await screen.findByLabelText("Code from the bridge terminal"), "K7F-29Q");
      await user.click(screen.getByRole("button", { name: "Pair" }));
      expect(await screen.findByTestId("codex-state")).toHaveTextContent("Checking Codex on your computer…");
      expect(onConnected).not.toHaveBeenCalled();
    });

    test("a failed pair says Codex could not connect", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — the connect error names Codex.
      const user = userEvent.setup();
      const c = codexClient(() => hello());
      c.pair = async () => {
        throw "nope";
      };
      render(<ClaudeCodeConnect engine="codex" relayBrowser={false} client={c} commands={commands} onConnected={() => {}} />);
      await user.click(screen.getByRole("button", { name: /I've started it/ }));
      await user.type(await screen.findByLabelText("Code from the bridge terminal"), "K7F-29Q");
      await user.click(screen.getByRole("button", { name: "Pair" }));
      expect(await screen.findByTestId("claude-code-error")).toHaveTextContent("Codex could not connect.");
    });

    test("no engines shows the out-of-date sentence and does not call onConnected", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — an older bridge has no engines.
      const user = userEvent.setup();
      const c = codexClient(() => hello());
      const onConnected = vi.fn();
      render(<ClaudeCodeConnect engine="codex" relayBrowser={false} client={c} commands={commands} onConnected={onConnected} />);
      await user.click(screen.getByRole("button", { name: /I've started it/ }));
      await user.type(await screen.findByLabelText("Code from the bridge terminal"), "K7F-29Q");
      await user.click(screen.getByRole("button", { name: "Pair" }));
      expect(await screen.findByTestId("codex-state")).toHaveTextContent("Your bridge is out of date. Update it to use Codex.");
      expect(onConnected).not.toHaveBeenCalled();
    });

    test("already paired at mount shows the paired line and no code box", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — steps 2 and 3 are replaced when already paired.
      const c = codexClient(() => hello([codexEngine({ ready: false, reason: "Codex is not signed in." })]));
      alreadyPaired(c);
      const onConnected = vi.fn();
      render(<ClaudeCodeConnect engine="codex" relayBrowser={false} client={c} commands={commands} onConnected={onConnected} />);
      expect(await screen.findByTestId("codex-already-paired")).toHaveTextContent(
        "Your bridge is already paired. Finish step 1, then press Check again.",
      );
      expect(screen.queryByTestId("claude-code-command")).not.toBeInTheDocument();
      expect(screen.queryByTestId("claude-code-code-command")).not.toBeInTheDocument();
      expect(screen.queryByTestId("claude-code-install-command")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Code from the bridge terminal")).not.toBeInTheDocument();
      expect(screen.getByTestId("codex-install")).toBeInTheDocument();
      expect(onConnected).not.toHaveBeenCalled();
    });

    test("already paired and ready calls onConnected with readConnected and shows nothing more", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — a paired mount that is ready uses readConnected.
      const c = codexClient(() => hello([codexEngine({ ready: true })]));
      alreadyPaired(c);
      const onConnected = vi.fn();
      const { container } = render(<ClaudeCodeConnect engine="codex" relayBrowser={false} client={c} commands={commands} onConnected={onConnected} />);
      await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
      expect(onConnected).toHaveBeenCalledWith(READBACK);
      expect(container.textContent ?? "").toBe("");
    });
  });

  describe("ClaudeCodeRelayButton", () => {
    test("uses engineName in the bar sentence", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — the relay bar names the engine.
      const c = baseClient();
      c.directBlocked = async () => true;
      c.relayState = () => "closed";
      c.onRelayChange = () => () => {};
      render(<ClaudeCodeRelayButton client={c} relayBrowser engineName="Codex" />);
      expect(await screen.findByTestId("claude-code-relay-bar")).toHaveTextContent("Safari needs the bridge window for Codex.");
    });
  });
});
