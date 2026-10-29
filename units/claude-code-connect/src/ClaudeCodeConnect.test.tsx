import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bridgeCommands, createClaudeCodeClient, type ClaudeCodeReadback } from "@kaigilb/gilbplatformcode-claude-code-client";
import { ClaudeCodeConnect, ClaudeCodeBadge } from "./index";

const PRINCIPAL = "https://pelle.example/base";
let fetchMock: ReturnType<typeof vi.fn>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const commands = bridgeCommands({ origin: "https://app.example.com", basePath: "/", allowOrigin: "https://app.example.com" });
const client = () => createClaudeCodeClient({ principal: PRINCIPAL, platformOrigin: "https://gilb.com", bridgeUrl: "http://127.0.0.1:47821", getAuthHeaders: async () => ({}) });

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function toCodeBox(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /I've started it/ }));
}

describe("bridgeCommands", () => {
  it("builds the one-off, the always-on and the code command from the app's own origin", () => {
    expect(commands.start).toBe(
      "curl -fsSL https://app.example.com/claude-code-bridge.mjs -o ~/.gilb-claude-code-bridge.mjs && node ~/.gilb-claude-code-bridge.mjs --allow-origin https://app.example.com",
    );
    expect(commands.install).toBe(`${commands.start.replace(/ --allow-origin .*$/, "")} --install --allow-origin https://app.example.com`);
    expect(commands.code).toBe("node ~/.gilb-claude-code-bridge.mjs --code");
  });

  it("without allowOrigin there is no flag (an app the bridge already lists)", () => {
    const c = bridgeCommands({ origin: "https://gilb.com", basePath: "/app/" });
    expect(c.start).toBe("curl -fsSL https://gilb.com/app/claude-code-bridge.mjs -o ~/.gilb-claude-code-bridge.mjs && node ~/.gilb-claude-code-bridge.mjs");
    expect(c.install.endsWith("--install")).toBe(true);
  });

  it("derives the URL from origin and base path, tolerating slashes", () => {
    expect(bridgeCommands({ origin: "http://localhost:5197/", basePath: "/app/" }).start).toContain("http://localhost:5197/app/claude-code-bridge.mjs");
    expect(bridgeCommands({ origin: "https://x.test", basePath: "/" }).start).toContain("https://x.test/claude-code-bridge.mjs");
    expect(bridgeCommands({ origin: "https://x.test", bridgeFileUrl: "https://cdn.x.test/b.mjs" }).start).toContain("https://cdn.x.test/b.mjs");
  });

  it("never lets shell syntax into the line the person pastes", () => {
    expect(() => bridgeCommands({ origin: "https://x.test", bridgeFileUrl: "https://x.test/a; rm -rf ~" })).toThrow();
    expect(() => bridgeCommands({ origin: "https://x.test", allowOrigin: "https://x.test$(id)" })).toThrow();
    expect(() => bridgeCommands({ origin: "https://x.test/`id`" })).toThrow();
  });
});

describe("<ClaudeCodeConnect>", () => {
  it("opens on the instruction step with both commands, and does not probe yet", () => {
    render(<ClaudeCodeConnect client={client()} commands={commands} onConnected={() => {}} />);
    const steps = screen.getByTestId("claude-code-steps");
    expect(steps).toHaveTextContent("Claude subscription");
    expect(steps).toHaveTextContent("claude auth login");
    expect(steps).toHaveTextContent("Node.js 18 or newer");
    expect(steps).toHaveTextContent("Option Always On");
    expect(screen.getByTestId("claude-code-command")).toHaveTextContent(commands.start);
    expect(screen.getByTestId("claude-code-install-command")).toHaveTextContent(commands.install);
    expect(steps).toHaveTextContent(commands.code);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Code from the bridge terminal")).not.toBeInTheDocument();
  });

  it("Copy puts exactly the one-off command, and Copy always-on exactly the install command, on the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<ClaudeCodeConnect client={client()} commands={commands} onConnected={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenLastCalledWith(commands.start);
    await user.click(screen.getByRole("button", { name: "Copy always-on command" }));
    expect(writeText).toHaveBeenLastCalledWith(commands.install);
  });

  it("with no bridge running it shows the command and can try again", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ClaudeCodeConnect client={client()} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    expect(await screen.findByTestId("claude-code-bridge-hint")).toHaveTextContent(commands.start);
    fetchMock.mockResolvedValue(json(200, { bridge: "gilb-claude-code-bridge" }));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Code from the bridge terminal")).toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-bridge-hint")).not.toBeInTheDocument();
  });

  it("pairs once with the typed code, keeps the secret in localStorage and tells the app", async () => {
    const user = userEvent.setup();
    const c = client();
    const onConnected = vi.fn<(r: ClaudeCodeReadback) => void>();
    fetchMock.mockImplementation(async (url: string) => (url.endsWith("/v1/hello") ? json(200, { bridge: "gilb-claude-code-bridge" }) : json(200, { secret: "sec" })));
    render(<ClaudeCodeConnect client={c} commands={commands} onConnected={onConnected} />);
    await toCodeBox(user);
    await user.type(await screen.findByLabelText("Code from the bridge terminal"), "K7F-29Q");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(onConnected.mock.calls[0]![0]).toMatchObject({ provider: "claude-code", connected: true });
    expect(JSON.stringify(onConnected.mock.calls[0]![0])).not.toContain("sec");
    expect(c.load()?.secret).toBe("sec");
    const pairCall = fetchMock.mock.calls.find((x) => String(x[0]).endsWith("/v1/pair"))!;
    expect(JSON.parse(String((pairCall[1] as RequestInit).body))).toEqual({ code: "K7F-29Q", principalHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("a wrong code shows the bridge's sentence (here, no onError) and stays on the code box", async () => {
    const user = userEvent.setup();
    const c = client();
    fetchMock.mockImplementation(async (url: string) => (url.endsWith("/v1/hello") ? json(200, { bridge: "gilb-claude-code-bridge" }) : json(401, { error: "That code is not right." })));
    render(<ClaudeCodeConnect client={c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await user.type(await screen.findByLabelText("Code from the bridge terminal"), "AAA-AAA");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    expect(await screen.findByText("That code is not right.")).toBeInTheDocument();
    expect(c.load()).toBeNull();
    expect(screen.getByLabelText("Code from the bridge terminal")).toBeInTheDocument();
  });

  it("with onError the app shows the error itself and the component shows none", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    fetchMock.mockImplementation(async (url: string) => (url.endsWith("/v1/hello") ? json(200, { bridge: "gilb-claude-code-bridge" }) : json(401, { error: "That code is not right." })));
    render(<ClaudeCodeConnect client={client()} commands={commands} onConnected={() => {}} onError={onError} />);
    await toCodeBox(user);
    await user.type(await screen.findByLabelText("Code from the bridge terminal"), "AAA-AAA");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    await vi.waitFor(() => expect(onError).toHaveBeenLastCalledWith("That code is not right."));
    expect(screen.queryByTestId("claude-code-error")).not.toBeInTheDocument();
  });

  it("an app's own Button component is used for every button", () => {
    const Button = ({ variant, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => <button data-my-button={variant} {...rest} />;
    const { container } = render(<ClaudeCodeConnect client={client()} commands={commands} onConnected={() => {}} Button={Button} />);
    expect(container.querySelectorAll("button")).toHaveLength(6);
    expect(container.querySelectorAll("button[data-my-button=ghost]")).toHaveLength(5);
    expect(container.querySelectorAll(".gcc-btn")).toHaveLength(0);
  });
});

describe("<ClaudeCodeConnect> sections", () => {
  const renderIt = () => render(<ClaudeCodeConnect client={client()} commands={commands} onConnected={() => {}} />);

  it("shows three separate groups with the exact headings", () => {
    renderIt();
    for (const name of ["1 · Before you start", "2 · Start the bridge on your computer", "3 · Enter your pairing code"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("gives the get-code command its own box with a Copy that copies exactly it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderIt();
    expect(screen.getByTestId("claude-code-code-command")).toHaveTextContent(commands.code);
    await user.click(screen.getByRole("button", { name: "Copy code command" }));
    expect(writeText).toHaveBeenLastCalledWith(commands.code);
  });

  it("notes that the command must start with node", () => {
    renderIt();
    expect(screen.getByTestId("claude-code-node-note")).toHaveTextContent('Type it exactly, starting with node. Without node your Mac answers "Permission denied".');
  });

  it("gives claude auth login its own Copy", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderIt();
    await user.click(screen.getByRole("button", { name: "Copy sign-in command" }));
    expect(writeText).toHaveBeenLastCalledWith("claude auth login");
  });

  it("puts the enter-code button in section 3 and the two start choices in section 2", () => {
    renderIt();
    expect(screen.getByRole("group", { name: "3 · Enter your pairing code" })).toContainElement(screen.getByRole("button", { name: /I've started it/ }));
    const two = screen.getByRole("group", { name: "2 · Start the bridge on your computer" });
    expect(two).toContainElement(screen.getByTestId("claude-code-install-command"));
    expect(two).toContainElement(screen.getByTestId("claude-code-command"));
  });
});

describe("<ClaudeCodeConnect> wording round CM2", () => {
  const renderIt = () => render(<ClaudeCodeConnect client={client()} commands={commands} onConnected={() => {}} />);

  it("section 1 says signed in using Terminal, explains Node.js, links nodejs.org, and copies node --version", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderIt();
    const one = screen.getByRole("group", { name: "1 · Before you start" });
    expect(one).toHaveTextContent("signed in");
    expect(one).toHaveTextContent("Terminal");
    expect(one).toHaveTextContent("Node.js 18 or newer");
    expect(screen.getByTestId("claude-code-node-check")).toHaveTextContent("node --version");
    await user.click(screen.getByRole("button", { name: "Copy node check command" }));
    expect(writeText).toHaveBeenLastCalledWith("node --version");
    const link = screen.getByRole("link", { name: "nodejs.org" });
    expect(link).toHaveAttribute("href", "https://nodejs.org");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("section 2 has the two option headings, the platform lines and the Windows line", () => {
    renderIt();
    const two = screen.getByRole("group", { name: "2 · Start the bridge on your computer" });
    expect(within(two).getByText("Option Always On")).toBeInTheDocument();
    expect(within(two).getByText("Option One Session")).toBeInTheDocument();
    expect(within(two).getByText("Mac only for now.")).toBeInTheDocument();
    expect(within(two).getByText("Mac and Linux.")).toBeInTheDocument();
    expect(within(two).getByText("Windows: not supported yet.")).toBeInTheDocument();
    expect(two).toHaveTextContent("Choose one option.");
    expect(two).not.toHaveTextContent("Just this time");
  });

  it("section 3 has both option lines", () => {
    renderIt();
    const three = screen.getByRole("group", { name: "3 · Enter your pairing code" });
    expect(three).toHaveTextContent("Option Always On: get your code by pasting this in Terminal.");
    expect(three).toHaveTextContent("Option One Session: the code is shown in the Terminal window.");
  });
});

describe("<ClaudeCodeBadge>", () => {
  it("is a small stack: the name on top, Disconnect directly beneath", async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(<ClaudeCodeBadge onDisconnect={onDisconnect} />);
    const group = screen.getByRole("group", { name: "Claude Code connected" });
    expect(group.children).toHaveLength(2);
    expect(group.children[0]).toHaveTextContent(/^Claude Code$/);
    expect(group.children[1]).toHaveAccessibleName("Claude Code connected — disconnect");
    await user.click(screen.getByTestId("claude-code-connected"));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});
