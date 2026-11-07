import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bridgeCommands, createClaudeCodeClient, type ClaudeCodeReadback } from "@kaigilb/gilbplatformcode-claude-code-client";
import { ClaudeCodeConnect, ClaudeCodeBadge, ClaudeCodeRelayButton, SUPPORTED_BROWSERS, NOT_YET_BROWSERS } from "./index";
import { defaultSystem, isRelayBrowser, isBraveBrowser } from "./ClaudeCodeConnect";

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
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
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
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenLastCalledWith(commands.start);
    await user.click(screen.getByRole("button", { name: "Copy always-on command" }));
    expect(writeText).toHaveBeenLastCalledWith(commands.install);
  });

  it("with no bridge running it shows the command, and Check again clears the hint once the bridge answers", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    expect(await screen.findByTestId("claude-code-bridge-hint")).toHaveTextContent(commands.start);
    fetchMock.mockResolvedValue(json(200, { bridge: "gilb-claude-code-bridge" }));
    await user.click(screen.getByTestId("claude-code-recheck"));
    await vi.waitFor(() => expect(screen.queryByTestId("claude-code-bridge-hint")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Code from the bridge terminal")).toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-recheck")).not.toBeInTheDocument();
  });

  it("pairs once with the typed code, keeps the secret in localStorage and tells the app", async () => {
    const user = userEvent.setup();
    const c = client();
    const onConnected = vi.fn<(r: ClaudeCodeReadback) => void>();
    fetchMock.mockImplementation(async (url: string) => (url.endsWith("/v1/hello") ? json(200, { bridge: "gilb-claude-code-bridge" }) : json(200, { secret: "sec" })));
    render(<ClaudeCodeConnect relayBrowser={false} client={c} commands={commands} onConnected={onConnected} />);
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
    render(<ClaudeCodeConnect relayBrowser={false} client={c} commands={commands} onConnected={() => {}} />);
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
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} onError={onError} />);
    await toCodeBox(user);
    await user.type(await screen.findByLabelText("Code from the bridge terminal"), "AAA-AAA");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    await vi.waitFor(() => expect(onError).toHaveBeenLastCalledWith("That code is not right."));
    expect(screen.queryByTestId("claude-code-error")).not.toBeInTheDocument();
  });

  it("an app's own Button component is used for every button", () => {
    const Button = ({ variant, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => <button data-my-button={variant} {...rest} />;
    const { container } = render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} Button={Button} />);
    expect(container.querySelectorAll("button")).toHaveLength(9);
    expect(container.querySelectorAll("button[data-my-button=ghost]")).toHaveLength(5);
    expect(container.querySelectorAll(".gcc-btn")).toHaveLength(0);
  });
});

describe("<ClaudeCodeConnect> sections", () => {
  const renderIt = () => render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);

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
  const renderIt = () => render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);

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

  it("section 2 has the two option headings", () => {
    renderIt();
    const two = screen.getByRole("group", { name: "2 · Start the bridge on your computer" });
    expect(within(two).getByText("Option Always On")).toBeInTheDocument();
    expect(within(two).getByText("Option One Session")).toBeInTheDocument();
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

describe("defaultSystem", () => {
  it("picks the tab from the browser's platform string", () => {
    expect(defaultSystem("Win32")).toBe("windows");
    expect(defaultSystem("Windows")).toBe("windows");
    expect(defaultSystem("Linux x86_64")).toBe("linux");
    expect(defaultSystem("Linux armv8l; Android")).toBe("mac");
    expect(defaultSystem("MacIntel")).toBe("mac");
    expect(defaultSystem("")).toBe("mac");
  });
});

describe("<ClaudeCodeConnect> system tabs CM3", () => {
  const renderIt = () => render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
  const tab = (n: "mac" | "windows" | "linux") => screen.getByTestId(`claude-code-tab-${n}`);

  it("shows three tabs in order Mac, Windows, Linux with the tabs wiring", () => {
    renderIt();
    const list = screen.getByRole("tablist", { name: "Your computer" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Mac", "Windows", "Linux"]);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toEqual([tab("mac")]);
    expect(tab("mac")).toHaveAttribute("tabindex", "0");
    expect(tab("windows")).toHaveAttribute("tabindex", "-1");
    expect(tab("linux")).toHaveAttribute("tabindex", "-1");
    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(1);
    expect(tab("mac")).toHaveAttribute("aria-controls", panels[0]!.id);
    expect(panels[0]).toHaveAttribute("aria-labelledby", tab("mac").id);
    expect(screen.getByTestId("claude-code-steps")).toContainElement(list);
  });

  it("arrow keys move and select with wrap-around, Home and End jump", async () => {
    const user = userEvent.setup();
    renderIt();
    tab("mac").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("windows")).toHaveAttribute("aria-selected", "true");
    expect(tab("windows")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(tab("linux")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    expect(tab("mac")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(tab("linux")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(tab("mac")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(tab("linux")).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });

  it("Windows says it is not available yet and links a request mail (the host passes the address: the unit names no host)", async () => {
    const user = userEvent.setup();
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} supportEmail="support@gilb.com" />);
    await user.click(tab("windows"));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("heading", { name: "Windows is not available yet" })).toBeInTheDocument();
    expect(panel).toHaveTextContent("Claude Code cannot connect from a Windows computer yet. If you need it, ask us at support@gilb.com and we will tell you when it works.");
    expect(screen.getByTestId("claude-code-windows-request")).toHaveAttribute("href", "mailto:support@gilb.com?subject=Claude%20Code%20on%20Windows");
    expect(screen.queryByTestId("claude-code-command")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /I've started it/ })).not.toBeInTheDocument();
  });

  it("Linux shows only the one-session command and the terminal-window code line", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(tab("linux"));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByTestId("claude-code-command")).toHaveTextContent(commands.start);
    expect(screen.queryByTestId("claude-code-install-command")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-code-command")).not.toBeInTheDocument();
    expect(panel).toHaveTextContent("The code is shown in the terminal window.");
    expect(panel).toHaveTextContent("Option One Session");
    expect(panel).not.toHaveTextContent("Option Always On");
    expect(panel).not.toHaveTextContent("Your Mac");
    expect(panel).not.toHaveTextContent("your Mac");
    expect(panel).not.toHaveTextContent("Terminal");
    expect(within(panel).getByRole("button", { name: /I've started it — enter code/ })).toBeInTheDocument();
  });

  it("Mac has all three command boxes and none of the per-system lines", () => {
    renderIt();
    expect(screen.getByTestId("claude-code-install-command")).toBeInTheDocument();
    expect(screen.getByTestId("claude-code-command")).toBeInTheDocument();
    expect(screen.getByTestId("claude-code-code-command")).toBeInTheDocument();
    const steps = screen.getByTestId("claude-code-steps");
    expect(steps).not.toHaveTextContent("Mac only for now.");
    expect(steps).not.toHaveTextContent("Mac and Linux.");
    expect(steps).not.toHaveTextContent("Windows: not supported yet.");
  });

  it("the code entry survives switching between Mac and Linux", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, { bridge: "gilb-claude-code-bridge" }));
    renderIt();
    await toCodeBox(user);
    await user.type(await screen.findByLabelText("Code from the bridge terminal"), "K7F");
    await user.click(tab("linux"));
    expect(screen.getByLabelText("Code from the bridge terminal")).toHaveValue("K7F");
    await user.click(tab("mac"));
    expect(screen.getByLabelText("Code from the bridge terminal")).toHaveValue("K7F");
  });
});

// Supported browsers (Kai, 2026-11-07), from a measurement on a Mac, 2026-11-05, bridge 0.1.6:
// Chrome and Edge pass, Safari and Brave fail directly; Safari works through the bridge window. Mac tab only; Linux and Windows are not measured.
describe("<ClaudeCodeConnect> supported browsers", () => {
  const renderIt = () => render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} supportEmail="support@gilb.com" />);
  const tab = (n: "mac" | "windows" | "linux") => screen.getByTestId(`claude-code-tab-${n}`);
  const ALLOW_BEFORE = "When you pair, your browser may ask to let this page use apps on this device. Choose Allow.";
  const SAFARI = "In Safari, Claude Code works through a small bridge window that you open in step 3. Keep it open while you chat; you can minimise it. ";
  const BRAVE = "In Brave, allow it once yourself: click the icon left of the address, open Site settings, and set Apps on device to Allow. ";
  const BROWSER_TEXT = "Supported browsers: Chrome, Edge, Safari and Brave. " + SAFARI + BRAVE + ALLOW_BEFORE;

  it("the lists are the measured ones", () => {
    expect(SUPPORTED_BROWSERS).toEqual(["Chrome", "Edge", "Safari", "Brave"]);
    expect(NOT_YET_BROWSERS).toEqual([]);
  });

  it("Mac: section 1 leads with a supported browser, and the browser item is first with exactly the text", () => {
    renderIt();
    const one = screen.getByRole("group", { name: "1 · Before you start" });
    expect(one).toHaveTextContent("You need a supported browser and two programs on your computer:");
    expect(one).not.toHaveTextContent("You need two programs on your computer:");
    const item = screen.getByTestId("claude-code-supported-browsers");
    expect(item.textContent?.replace(/\s+/g, " ").trim()).toBe(BROWSER_TEXT);
    expect(within(item).getByText("Supported browsers: Chrome, Edge, Safari and Brave.").tagName).toBe("STRONG");
    const items = one.querySelectorAll("ul.gcc-list > li");
    expect(items).toHaveLength(3);
    expect(items[0]).toBe(item);
    expect(item).not.toHaveTextContent("Gilb");
  });

  it("Mac: the item carries the Brave one-time step, exact text", () => {
    renderIt();
    expect(screen.getByTestId("claude-code-supported-browsers")).toHaveTextContent(BRAVE.trim());
  });

  it("Mac: the item carries the allow sentence, exact text", () => {
    renderIt();
    expect(screen.getByTestId("claude-code-supported-browsers")).toHaveTextContent(ALLOW_BEFORE);
  });

  it("an empty not-yet list drops the cannot-connect sentence", () => {
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} notYetBrowsers={[]} />);
    const text = screen.getByTestId("claude-code-supported-browsers").textContent?.replace(/\s+/g, " ").trim();
    expect(text).toBe(BROWSER_TEXT);
    expect(text).not.toContain("cannot connect");
  });

  it("a one-item not-yet list reads 'it'", () => {
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} notYetBrowsers={["Brave"]} />);
    expect(screen.getByTestId("claude-code-supported-browsers").textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Supported browsers: Chrome, Edge, Safari and Brave. Brave cannot connect to Claude Code yet. If you are in it, open this page in Chrome, Edge, Safari or Brave. " + SAFARI + BRAVE + ALLOW_BEFORE,
    );
  });

  it("the supported list can be passed in", () => {
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} supportedBrowsers={["Chrome"]} notYetBrowsers={["Brave"]} />);
    expect(screen.getByTestId("claude-code-supported-browsers")).toHaveTextContent("Supported browsers: Chrome. Brave cannot connect to Claude Code yet. If you are in it, open this page in Chrome.");
    expect(screen.getByTestId("claude-code-supported-browsers")).not.toHaveTextContent("In Brave, allow it once");
  });

  it("Linux: section 1 keeps the two-programs line and shows no browser item", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(tab("linux"));
    const one = screen.getByRole("group", { name: "1 · Before you start" });
    expect(one).toHaveTextContent("You need two programs on your computer:");
    expect(one).not.toHaveTextContent("supported browser");
    expect(screen.queryByTestId("claude-code-supported-browsers")).not.toBeInTheDocument();
    expect(one.querySelectorAll("ul.gcc-list > li")).toHaveLength(2);
  });

  it("Windows: unchanged, only the not-available panel, no browser item", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(tab("windows"));
    const panel = screen.getByRole("tabpanel");
    expect(screen.queryByTestId("claude-code-supported-browsers")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "1 · Before you start" })).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent("browser");
    expect(panel).toHaveTextContent("Claude Code cannot connect from a Windows computer yet. If you need it, ask us at support@gilb.com and we will tell you when it works.");
  });
});

describe("<ClaudeCodeConnect> allow hint in step 3", () => {
  const ALLOW_AFTER =
    "If your browser asked to let this page use apps on this device, choose Allow. If you chose Block, open the site settings (the icon left of the address) and allow it, then check again.";

  it.each(["mac", "linux"] as const)("%s: shown with exact text when the bridge check fails, absent before", async (sys) => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await user.click(screen.getByTestId(`claude-code-tab-${sys}`));
    expect(screen.queryByTestId("claude-code-allow-hint")).not.toBeInTheDocument();
    await toCodeBox(user);
    const hint = await screen.findByTestId("claude-code-allow-hint");
    expect(hint.textContent).toBe(ALLOW_AFTER);
    expect(screen.getByTestId("claude-code-bridge-hint")).toContainElement(hint);
  });

  it("absent when the bridge answers", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, { bridge: "gilb-claude-code-bridge" }));
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await screen.findByLabelText("Code from the bridge terminal");
    expect(screen.queryByTestId("claude-code-allow-hint")).not.toBeInTheDocument();
  });
});

// Spec: F.ClaudeCodeCodeFieldAlways (Kai, 2026-11-04) — in step 3 the code field and Pair are always there,
// whatever the bridge check said; "Check again" looks again without losing what was typed.
describe("<ClaudeCodeConnect> code field always shown", () => {
  const hello = () => json(200, { bridge: "gilb-claude-code-bridge" });

  it("when the bridge check says not reachable, the field, Pair and Check again are all there and the field takes typing", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    expect(await screen.findByTestId("claude-code-bridge-hint")).toBeInTheDocument();
    const field = screen.getByLabelText("Code from the bridge terminal");
    expect(field).toBeEnabled();
    await user.type(field, "K7F-29Q");
    expect(field).toHaveValue("K7F-29Q");
    expect(screen.getByRole("button", { name: "Pair" })).toBeEnabled();
    expect(screen.getByTestId("claude-code-recheck")).toHaveTextContent("Check again");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("Check again keeps what the person typed", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await screen.findByTestId("claude-code-bridge-hint");
    await user.type(screen.getByLabelText("Code from the bridge terminal"), "K7F-29Q");
    await user.click(screen.getByTestId("claude-code-recheck"));
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter((x) => String(x[0]).endsWith("/v1/hello"))).toHaveLength(2));
    expect(screen.getByLabelText("Code from the bridge terminal")).toHaveValue("K7F-29Q");
    expect(screen.getByTestId("claude-code-bridge-hint")).toBeInTheDocument();
    fetchMock.mockResolvedValue(hello());
    await user.click(screen.getByTestId("claude-code-recheck"));
    await vi.waitFor(() => expect(screen.queryByTestId("claude-code-bridge-hint")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Code from the bridge terminal")).toHaveValue("K7F-29Q");
  });

  it("Pair still works after the first check said not reachable, and clears the hint", async () => {
    const user = userEvent.setup();
    const c = client();
    const onConnected = vi.fn<(r: ClaudeCodeReadback) => void>();
    let firstHello = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/v1/hello")) {
        if (firstHello) {
          firstHello = false;
          throw new TypeError("Failed to fetch");
        }
        return hello();
      }
      return json(200, { secret: "sec" });
    });
    render(<ClaudeCodeConnect relayBrowser={false} client={c} commands={commands} onConnected={onConnected} />);
    await toCodeBox(user);
    await screen.findByTestId("claude-code-bridge-hint");
    await user.type(screen.getByLabelText("Code from the bridge terminal"), "K7F-29Q");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(c.load()?.secret).toBe("sec");
    expect(screen.queryByTestId("claude-code-bridge-hint")).not.toBeInTheDocument();
  });

  it("while the first check is still running, the field takes typing", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    const field = screen.getByLabelText("Code from the bridge terminal");
    expect(field).toBeEnabled();
    await user.type(field, "K7F");
    expect(field).toHaveValue("K7F");
    expect(screen.getByRole("button", { name: "Pair" })).toBeEnabled();
  });

  it("Pair is off while the field is empty", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await screen.findByTestId("claude-code-bridge-hint");
    expect(screen.getByRole("button", { name: "Pair" })).toBeDisabled();
  });

  it("when the bridge is really down, Pair shows the error and the hint, and the field stays", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/v1/hello")) return hello();
      throw new TypeError("Failed to fetch");
    });
    render(<ClaudeCodeConnect relayBrowser={false} client={client()} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await user.type(screen.getByLabelText("Code from the bridge terminal"), "K7F-29Q");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    expect(await screen.findByTestId("claude-code-error")).toBeInTheDocument();
    expect(screen.getByTestId("claude-code-bridge-hint")).toBeInTheDocument();
    expect(screen.getByLabelText("Code from the bridge terminal")).toBeInTheDocument();
    expect(screen.getByTestId("claude-code-recheck")).toBeInTheDocument();
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

type RelayState = "closed" | "opening" | "open";
/** A real client with the relay methods replaced by recorders. */
function stubClient(over: { openRelay?: () => Promise<boolean>; directBlocked?: () => Promise<boolean>; probe?: () => Promise<boolean>; state?: RelayState } = {}) {
  const c = client();
  const listeners = new Set<(s: RelayState) => void>();
  let state: RelayState = over.state ?? "closed";
  const calls = { openRelay: 0, probe: 0, directBlocked: 0 };
  c.openRelay = () => {
    calls.openRelay++;
    return over.openRelay ? over.openRelay() : Promise.resolve(true);
  };
  c.probe = async () => {
    calls.probe++;
    return over.probe ? over.probe() : false;
  };
  c.directBlocked = async () => {
    calls.directBlocked++;
    return over.directBlocked ? over.directBlocked() : true;
  };
  c.relayState = () => state;
  c.onRelayChange = (cb) => {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  };
  const fire = (s: RelayState) => {
    state = s;
    listeners.forEach((l) => l(s));
  };
  return { c, calls, fire, listeners };
}

const RELAY_OFFER_TEXT =
  "Safari only reaches the bridge through a small window. Open it, then keep it open while you chat (you can minimise it). If the window says it cannot connect, check the bridge is running: paste the Option Always On command from step 2 again.";
const RELAY_FAILED_TEXT =
  "The bridge window did not open. If Safari blocked it, allow pop-ups for this site (Safari › Settings for This Website › Pop-up Windows › Allow) and try again. If it opened but stayed empty, your bridge is older: run the Option Always On command in step 2 again to update it.";

describe("<ClaudeCodeConnect> bridge window block in step 3", () => {
  it.each(["mac", "linux"] as const)("%s: absent before a failed check, present after, with exact text", async (sys) => {
    const user = userEvent.setup();
    const { c } = stubClient({ probe: async () => false });
    render(<ClaudeCodeConnect relayBrowser client={c} commands={commands} onConnected={() => {}} />);
    await user.click(screen.getByTestId(`claude-code-tab-${sys}`));
    expect(screen.queryByTestId("claude-code-relay")).not.toBeInTheDocument();
    await toCodeBox(user);
    const block = await screen.findByTestId("claude-code-relay");
    expect(block).toHaveTextContent(RELAY_OFFER_TEXT);
    expect(screen.getByTestId("claude-code-relay-open")).toHaveTextContent("Open bridge window");
    expect(screen.queryByTestId("claude-code-relay-failed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-bridge-hint")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-allow-hint")).not.toBeInTheDocument();
  });

  it("absent when the bridge answers", async () => {
    const user = userEvent.setup();
    const { c } = stubClient({ probe: async () => true });
    render(<ClaudeCodeConnect relayBrowser client={c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await screen.findByLabelText("Code from the bridge terminal");
    expect(screen.queryByTestId("claude-code-relay")).not.toBeInTheDocument();
  });

  it("Windows: no block", async () => {
    const user = userEvent.setup();
    const { c } = stubClient();
    render(<ClaudeCodeConnect relayBrowser client={c} commands={commands} onConnected={() => {}} />);
    await user.click(screen.getByTestId("claude-code-tab-windows"));
    expect(screen.queryByTestId("claude-code-relay")).not.toBeInTheDocument();
  });

  it("the click calls openRelay synchronously, before anything is awaited", async () => {
    const user = userEvent.setup();
    let probes = 0;
    const { c, calls } = stubClient({ probe: async () => (++probes, false), openRelay: () => new Promise(() => {}) });
    render(<ClaudeCodeConnect relayBrowser client={c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    const btn = await screen.findByTestId("claude-code-relay-open");
    expect(calls.openRelay).toBe(0);
    fireEvent.click(btn);
    expect(calls.openRelay).toBe(1); // no await between the click and the call
  });

  it("true: runs the check again, bridgeUp becomes true and the block goes", async () => {
    const user = userEvent.setup();
    let up = false;
    const { c, calls } = stubClient({ probe: async () => up, openRelay: async () => ((up = true), true) });
    render(<ClaudeCodeConnect relayBrowser client={c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await user.click(await screen.findByTestId("claude-code-relay-open"));
    await waitFor(() => expect(screen.queryByTestId("claude-code-relay")).not.toBeInTheDocument());
    expect(calls.probe).toBe(2);
    expect(screen.queryByTestId("claude-code-bridge-hint")).not.toBeInTheDocument();
  });

  it("false: shows the failed text exactly, and the block stays", async () => {
    const user = userEvent.setup();
    const { c, calls } = stubClient({ probe: async () => false, openRelay: async () => false });
    render(<ClaudeCodeConnect relayBrowser client={c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await user.click(await screen.findByTestId("claude-code-relay-open"));
    const failed = await screen.findByTestId("claude-code-relay-failed");
    expect(failed.textContent).toBe(RELAY_FAILED_TEXT);
    expect(calls.probe).toBe(1);
    expect(screen.getByTestId("claude-code-relay")).toBeInTheDocument();
  });

  it("while opening the button is disabled and reads Opening…, and it unsubscribes on unmount", async () => {
    const user = userEvent.setup();
    const { c, fire, listeners } = stubClient({ probe: async () => false });
    const view = render(<ClaudeCodeConnect relayBrowser client={c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    const btn = await screen.findByTestId("claude-code-relay-open");
    expect(btn).toBeEnabled();
    act(() => fire("opening"));
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Opening…");
    act(() => fire("closed"));
    expect(btn).toBeEnabled();
    expect(listeners.size).toBe(1);
    view.unmount();
    expect(listeners.size).toBe(0);
  });
});

describe("<ClaudeCodeRelayButton>", () => {
  it("renders nothing while the relay is open", async () => {
    const { c, calls } = stubClient({ state: "open", directBlocked: async () => true });
    const { container } = render(<ClaudeCodeRelayButton relayBrowser client={c} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(calls.directBlocked).toBeLessThanOrEqual(1);
  });

  it("renders nothing when direct calls are not blocked", async () => {
    const { c, calls } = stubClient({ directBlocked: async () => false });
    const { container } = render(<ClaudeCodeRelayButton relayBrowser client={c} />);
    await act(async () => {});
    expect(calls.directBlocked).toBe(1);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the block when blocked, with exact text", async () => {
    const { c } = stubClient({ directBlocked: async () => true });
    render(<ClaudeCodeRelayButton relayBrowser client={c} />);
    const bar = await screen.findByTestId("claude-code-relay-bar");
    expect(bar).toHaveTextContent("Safari needs the bridge window for Claude Code.");
    expect(screen.getByTestId("claude-code-relay-bar-open")).toHaveTextContent("Open bridge window");
  });

  it("the click calls openRelay synchronously; true calls onOpened", async () => {
    const onOpened = vi.fn();
    const { c, calls } = stubClient({ openRelay: async () => true });
    render(<ClaudeCodeRelayButton relayBrowser client={c} onOpened={onOpened} />);
    const btn = await screen.findByTestId("claude-code-relay-bar-open");
    fireEvent.click(btn);
    expect(calls.openRelay).toBe(1);
    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1));
  });

  it("false: onFailed gets the failed text; without onFailed it shows inline", async () => {
    const onFailed = vi.fn();
    const a = stubClient({ openRelay: async () => false });
    const first = render(<ClaudeCodeRelayButton relayBrowser client={a.c} onFailed={onFailed} />);
    fireEvent.click(await screen.findByTestId("claude-code-relay-bar-open"));
    await waitFor(() => expect(onFailed).toHaveBeenCalledWith(RELAY_FAILED_TEXT));
    expect(screen.queryByTestId("claude-code-relay-bar-failed")).not.toBeInTheDocument();
    first.unmount();
    const b = stubClient({ openRelay: async () => false });
    render(<ClaudeCodeRelayButton relayBrowser client={b.c} />);
    fireEvent.click(await screen.findByTestId("claude-code-relay-bar-open"));
    expect((await screen.findByTestId("claude-code-relay-bar-failed")).textContent).toBe(RELAY_FAILED_TEXT);
  });

  it("goes away when the relay opens, and comes back after it closes (re-checks directBlocked)", async () => {
    const { c, calls, fire } = stubClient({ directBlocked: async () => true });
    const { container } = render(<ClaudeCodeRelayButton relayBrowser client={c} />);
    await screen.findByTestId("claude-code-relay-bar");
    expect(calls.directBlocked).toBe(1);
    act(() => fire("open"));
    expect(container).toBeEmptyDOMElement();
    act(() => fire("closed"));
    await screen.findByTestId("claude-code-relay-bar");
    expect(calls.directBlocked).toBe(2);
  });

  it("closing re-check can hide it when direct calls now work; unsubscribes on unmount", async () => {
    let blocked = true;
    const { c, fire, listeners } = stubClient({ directBlocked: async () => blocked });
    const view = render(<ClaudeCodeRelayButton relayBrowser client={c} />);
    await screen.findByTestId("claude-code-relay-bar");
    blocked = false;
    act(() => fire("closed"));
    await waitFor(() => expect(screen.queryByTestId("claude-code-relay-bar")).not.toBeInTheDocument());
    view.unmount();
    expect(listeners.size).toBe(0);
  });
});

const UA = {
  safari26Mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
  operaMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0",
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
};

describe("isRelayBrowser", () => {
  it.each([
    ["Safari 26 macOS", UA.safari26Mac, true],
    ["iOS Safari", UA.iosSafari, true],
    ["Chrome macOS", UA.chromeMac, false],
    ["Edge", UA.edgeMac, false],
    ["Firefox", UA.firefoxMac, false],
    ["Opera", UA.operaMac, false],
    ["iOS Chrome (CriOS)", UA.iosChrome, false],
    ["empty", "", false],
  ])("%s", (_name, ua, want) => {
    expect(isRelayBrowser(ua)).toBe(want);
  });
});

describe("Safari-only wording follows the browser", () => {
  const original = navigator.userAgent;
  const setUA = (ua: string) => Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  afterEach(() => setUA(original));

  it("Safari UA (read from navigator): bar and step-3 block show", async () => {
    setUA(UA.safari26Mac);
    const user = userEvent.setup();
    const bar = stubClient({ directBlocked: async () => true });
    render(<ClaudeCodeRelayButton client={bar.c} />);
    await screen.findByTestId("claude-code-relay-bar");
    expect(bar.calls.directBlocked).toBe(1);
    const step = stubClient({ probe: async () => false });
    render(<ClaudeCodeConnect client={step.c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    expect(await screen.findByTestId("claude-code-relay")).toHaveTextContent(RELAY_OFFER_TEXT);
    expect(screen.queryByTestId("claude-code-bridge-hint")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-allow-hint")).not.toBeInTheDocument();
  });

  it.each([
    ["Chrome", UA.chromeMac],
    ["Edge", UA.edgeMac],
    ["Firefox", UA.firefoxMac],
    ["Brave-like (Chrome UA plus Brave/)", UA.chromeMac + " Brave/1.70"],
  ])("%s: no bar, directBlocked never called, no step-3 relay block", async (_n, ua) => {
    setUA(ua);
    const user = userEvent.setup();
    const bar = stubClient({ directBlocked: async () => true });
    const { container } = render(<ClaudeCodeRelayButton client={bar.c} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(bar.calls.directBlocked).toBe(0);
    act(() => bar.fire("closed"));
    await act(async () => {});
    expect(bar.calls.directBlocked).toBe(0);
    const step = stubClient({ probe: async () => false });
    render(<ClaudeCodeConnect client={step.c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    await screen.findByTestId("claude-code-bridge-hint");
    expect(screen.getByTestId("claude-code-allow-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-relay")).not.toBeInTheDocument();
  });

  it("Chrome UA, failed check: generic hint and allow hint show, no relay block", async () => {
    setUA(UA.chromeMac);
    const user = userEvent.setup();
    const step = stubClient({ probe: async () => false });
    render(<ClaudeCodeConnect client={step.c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    expect(await screen.findByTestId("claude-code-bridge-hint")).toHaveTextContent(commands.start);
    expect(screen.getByTestId("claude-code-allow-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-relay")).not.toBeInTheDocument();
  });

  const BRAVE_HINT = "Brave does not ask. Click the icon left of the address, open Site settings, set Apps on device to Allow, then check again.";

  it("Brave (override), failed check: Brave sentence exact, no generic one, no relay block", async () => {
    setUA(UA.chromeMac);
    const user = userEvent.setup();
    const step = stubClient({ probe: async () => false });
    render(<ClaudeCodeConnect braveBrowser client={step.c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    const hint = await screen.findByTestId("claude-code-allow-hint");
    expect(hint.textContent).toBe(BRAVE_HINT);
    expect(screen.getByTestId("claude-code-bridge-hint")).not.toHaveTextContent("If your browser asked");
    expect(screen.queryByTestId("claude-code-relay")).not.toBeInTheDocument();
  });

  it("Brave detected from navigator.brave (no prop): Brave sentence", async () => {
    setUA(UA.chromeMac);
    Object.defineProperty(navigator, "brave", { value: { isBrave: () => Promise.resolve(true) }, configurable: true });
    try {
      const user = userEvent.setup();
      const step = stubClient({ probe: async () => false });
      render(<ClaudeCodeConnect client={step.c} commands={commands} onConnected={() => {}} />);
      await toCodeBox(user);
      expect((await screen.findByTestId("claude-code-allow-hint")).textContent).toBe(BRAVE_HINT);
    } finally {
      delete (navigator as unknown as { brave?: unknown }).brave;
    }
  });

  it("Chrome (braveBrowser={false}), failed check: the generic Allow sentence", async () => {
    setUA(UA.chromeMac);
    const user = userEvent.setup();
    const step = stubClient({ probe: async () => false });
    render(<ClaudeCodeConnect braveBrowser={false} client={step.c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    const hint = await screen.findByTestId("claude-code-allow-hint");
    expect(hint.textContent).toBe(
      "If your browser asked to let this page use apps on this device, choose Allow. If you chose Block, open the site settings (the icon left of the address) and allow it, then check again.",
    );
  });

  it("Safari (relay) with braveBrowser: relay block only, no hint", async () => {
    const user = userEvent.setup();
    const step = stubClient({ probe: async () => false });
    render(<ClaudeCodeConnect relayBrowser braveBrowser client={step.c} commands={commands} onConnected={() => {}} />);
    await toCodeBox(user);
    expect(await screen.findByTestId("claude-code-relay")).toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-bridge-hint")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claude-code-allow-hint")).not.toBeInTheDocument();
  });

  it("relayBrowser={false} overrides a Safari UA; relayBrowser={true} overrides a Chrome UA", async () => {
    setUA(UA.safari26Mac);
    const a = stubClient({ directBlocked: async () => true });
    const first = render(<ClaudeCodeRelayButton client={a.c} relayBrowser={false} />);
    await act(async () => {});
    expect(first.container).toBeEmptyDOMElement();
    expect(a.calls.directBlocked).toBe(0);
    first.unmount();
    setUA(UA.chromeMac);
    const b = stubClient({ directBlocked: async () => true });
    render(<ClaudeCodeRelayButton client={b.c} relayBrowser />);
    await screen.findByTestId("claude-code-relay-bar");
  });
});

describe("isBraveBrowser", () => {
  it("true for navigator.brave with an isBrave function", () => {
    expect(isBraveBrowser({ brave: { isBrave: () => Promise.resolve(true) } })).toBe(true);
  });
  it("false for {}, a brave object without isBrave, and null", () => {
    expect(isBraveBrowser({})).toBe(false);
    expect(isBraveBrowser({ brave: {} })).toBe(false);
    expect(isBraveBrowser(null)).toBe(false);
  });
  it("false with no argument in jsdom (no navigator.brave)", () => {
    expect(isBraveBrowser()).toBe(false);
    expect(isBraveBrowser(undefined)).toBe(false);
  });
  it("false when reading throws", () => {
    const nav = {
      get brave(): never {
        throw new Error("no");
      },
    };
    expect(isBraveBrowser(nav)).toBe(false);
  });
});
