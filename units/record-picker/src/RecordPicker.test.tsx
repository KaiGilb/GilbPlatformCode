import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { OrgRecordPicker, PickerQueryContext, RecordPicker } from "./index";
import type { OrgRecordHit, PickerFind, PickerQueryArgs, PickerQueryResult, UsePickerQuery } from "./index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const VAULT = "https://p.example.test/vault";
const uri = (id: string) => `https://h.example.test/base/e/${id}`;
const hit = (id: string, label: string, more: Partial<OrgRecordHit> = {}): OrgRecordHit => ({ uri: uri(id), label, ...more });
const whole = (...hits: OrgRecordHit[]): PickerFind => ({ hits, complete: true });

// The host hook of the README: the real query library, with the options the picker's own call used.
const useRq: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
function Frame({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={useRq}>{children}</PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
const draw = (ui: ReactNode, client = newClient()) => render(ui, { wrapper: ({ children }) => <Frame client={client}>{children}</Frame> });

// A hook that only records what the picker asked and answers what it is told.
function recording(result: Partial<PickerQueryResult> = {}) {
  const calls: PickerQueryArgs[] = [];
  const hook: UsePickerQuery = (a) => {
    calls.push(a);
    return { isFetching: false, isError: false, isSuccess: false, ...result };
  };
  const wrapper = ({ children }: { children: ReactNode }) => <PickerQueryContext.Provider value={hook}>{children}</PickerQueryContext.Provider>;
  return { calls, wrapper, last: () => calls[calls.length - 1]! };
}
const box = (name = "Organization") => screen.getByRole("textbox", { name });

describe("the query hook is the host's", () => {
  it("throws, naming the provider, when there is none", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />)).toThrow(
      "record-picker: wrap the app in <PickerQueryContext.Provider value={usePickerQuery}>",
    );
    quiet.mockRestore();
  });

  it("RecordPicker is the same component as OrgRecordPicker", () => {
    expect(RecordPicker).toBe(OrgRecordPicker);
  });

  it("is called with exactly key, run, enabled and staleTime: no retry option crosses", () => {
    const r = recording();
    render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(Object.keys(r.last()).sort()).toEqual(["enabled", "key", "run", "staleTime"]);
  });

  it("builds the key from the label, the vault and the settled text", () => {
    const r = recording();
    render(<RecordPicker vaultId={VAULT} label="Part of" find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(r.last().key).toEqual(["record-picker", "Part of", VAULT, ""]);
  });

  it("the default label, and so the key's second part, is Organization", () => {
    const r = recording();
    render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(r.last().key).toEqual(["record-picker", "Organization", VAULT, ""]);
  });

  it("findKey takes the place of the label in the key", () => {
    const r = recording();
    render(<RecordPicker vaultId={VAULT} label="Part of" findKey="parts" find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(r.last().key).toEqual(["record-picker", "parts", VAULT, ""]);
  });

  it("a text the box opens with is searched at once, trimmed, not after the debounce", () => {
    const r = recording();
    render(<RecordPicker vaultId={VAULT} initialText="  Ann " find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(new Set(r.calls.map((c) => c.key[3]))).toEqual(new Set(["Ann"]));
    expect(r.calls[0]!.enabled).toBe(true);
  });

  it("staleTime is 10 000 ms unless the caller says otherwise, and 0 is a value", () => {
    const a = recording();
    render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />, { wrapper: a.wrapper });
    expect(a.last().staleTime).toBe(10_000);
    cleanup();
    const b = recording();
    render(<RecordPicker vaultId={VAULT} staleTime={0} find={async () => whole()} onPick={() => {}} />, { wrapper: b.wrapper });
    expect(b.last().staleTime).toBe(0);
    cleanup();
    const c = recording();
    render(<RecordPicker vaultId={VAULT} staleTime={30000} find={async () => whole()} onPick={() => {}} />, { wrapper: c.wrapper });
    expect(c.last().staleTime).toBe(30000);
  });

  it("run asks the caller's find for the settled text", async () => {
    const find = vi.fn(async (_t: string) => whole());
    const r = recording();
    render(<RecordPicker vaultId={VAULT} initialText="Ann" find={find} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(find).not.toHaveBeenCalled();
    await r.last().run();
    expect(find).toHaveBeenCalledWith("Ann");
  });

  it("enabled is true on mount with an empty box (the default searches on mount)", () => {
    const r = recording();
    render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(r.last().enabled).toBe(true);
  });

  it("enabled follows the caller's enabled", () => {
    const r = recording();
    const { rerender } = render(<RecordPicker vaultId={VAULT} enabled={false} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(r.last().enabled).toBe(false);
    rerender(<RecordPicker vaultId={VAULT} enabled find={async () => whole()} onPick={() => {}} />);
    expect(r.last().enabled).toBe(true);
  });

  it("searchOnMount=false: an empty box is not searched until it is focused", () => {
    const r = recording();
    render(<RecordPicker vaultId={VAULT} searchOnMount={false} autoFocus={false} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(r.last().enabled).toBe(false);
    fireEvent.focus(box());
    expect(r.last().enabled).toBe(true);
  });

  it("searchOnMount=false: opening by a click also lifts the wait, and the wait stays lifted when the box is emptied again", () => {
    const r = recording();
    render(<RecordPicker vaultId={VAULT} searchOnMount={false} autoFocus={false} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    fireEvent.click(box());
    expect(r.last().enabled).toBe(true);
    fireEvent.change(box(), { target: { value: "x" } });
    fireEvent.change(box(), { target: { value: "" } });
    expect(r.last().enabled).toBe(true);
  });

  it("searchOnMount=false: typed text is searched once it has been still, with no focus event", () => {
    vi.useFakeTimers();
    const r = recording();
    render(<RecordPicker vaultId={VAULT} searchOnMount={false} autoFocus={false} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    fireEvent.change(box(), { target: { value: "ab" } });
    act(() => void vi.advanceTimersByTime(250));
    expect(r.last().key[3]).toBe("ab");
    expect(r.last().enabled).toBe(true);
  });

  it("a caller's queryKey is used as it is, and the search waits while the debounce has not caught up", () => {
    vi.useFakeTimers();
    const r = recording();
    const keyFor = (t: string) => ["plan-search", VAULT, t] as const;
    function Host({ text }: { text: string }) {
      return <RecordPicker vaultId={VAULT} queryKey={keyFor(text)} find={async () => whole()} onPick={() => {}} />;
    }
    const { rerender } = render(<Host text="" />, { wrapper: r.wrapper });
    expect(r.last().key).toEqual(["plan-search", VAULT, ""]);
    expect(r.last().enabled).toBe(true);
    // The caller follows the live text through onTextChange; here the box text moves first.
    fireEvent.change(box(), { target: { value: "ab" } });
    rerender(<Host text="ab" />);
    expect(r.last().key).toEqual(["plan-search", VAULT, "ab"]);
    expect(r.last().enabled).toBe(false);
    act(() => void vi.advanceTimersByTime(250));
    expect(r.last().enabled).toBe(true);
  });
});

describe("debounce", () => {
  it("the key follows the box only after 250 ms of stillness, and a newer keystroke restarts the wait", () => {
    vi.useFakeTimers();
    const r = recording();
    render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    fireEvent.change(box(), { target: { value: "a" } });
    act(() => void vi.advanceTimersByTime(200));
    fireEvent.change(box(), { target: { value: "ab" } });
    act(() => void vi.advanceTimersByTime(249));
    expect(r.last().key[3]).toBe("");
    act(() => void vi.advanceTimersByTime(1));
    expect(r.last().key[3]).toBe("ab");
    expect(r.calls.map((c) => c.key[3])).not.toContain("a");
  });

  it("the settled text is trimmed; spaces alone are still the empty search", () => {
    vi.useFakeTimers();
    const r = recording();
    render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    fireEvent.change(box(), { target: { value: "  ab  " } });
    act(() => void vi.advanceTimersByTime(250));
    expect(r.last().key[3]).toBe("ab");
    fireEvent.change(box(), { target: { value: "   " } });
    act(() => void vi.advanceTimersByTime(250));
    expect(r.last().key[3]).toBe("");
  });

  it("there is no minimum length: a one-letter text is searched", () => {
    vi.useFakeTimers();
    const r = recording();
    render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    fireEvent.change(box(), { target: { value: "a" } });
    act(() => void vi.advanceTimersByTime(250));
    expect(r.last().key[3]).toBe("a");
    expect(r.last().enabled).toBe(true);
  });

  it("onTextChange hears every text at once, untrimmed, including the first (empty) one", () => {
    const heard: string[] = [];
    const r = recording();
    render(<RecordPicker vaultId={VAULT} onTextChange={(t) => heard.push(t)} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    fireEvent.change(box(), { target: { value: " a" } });
    expect(heard).toEqual(["", " a"]);
  });
});

describe("what it draws from the answer", () => {
  it("draws the hits as buttons under the hits list, with the default test ids", async () => {
    draw(<RecordPicker vaultId={VAULT} find={async () => whole(hit("a", "Ann Co"), hit("b", "Ben Co"))} onPick={() => {}} />);
    const list = await screen.findByTestId("org-record-hits");
    expect(within(list).getAllByTestId("org-record-hit").map((b) => b.textContent)).toEqual(["Ann Co", "Ben Co"]);
    expect(screen.getByTestId("org-record-picker")).toBeTruthy();
  });

  it("hitsTestId names the list", async () => {
    draw(<RecordPicker vaultId={VAULT} hitsTestId="plan-link-hits" find={async () => whole(hit("a", "Ann Co"))} onPick={() => {}} />);
    expect(await screen.findByTestId("plan-link-hits")).toBeTruthy();
    expect(screen.queryByTestId("org-record-hits")).toBeNull();
  });

  it("a group heading is drawn above the first hit of each run of one group, as a presentation paragraph", async () => {
    const find = async () =>
      whole(hit("a", "Ann", { group: "People" }), hit("b", "Ben", { group: "People" }), hit("c", "Cy", { group: "Teams" }), hit("d", "Di"), hit("e", "Ed", { group: "People" }));
    draw(<RecordPicker vaultId={VAULT} find={find} onPick={() => {}} />);
    await screen.findByTestId("org-record-hits");
    const headings = screen.getAllByTestId("org-record-group");
    expect(headings.map((h) => h.textContent)).toEqual(["People", "Teams", "People"]);
    expect(headings.every((h) => h.getAttribute("role") === "presentation")).toBe(true);
    const items = within(screen.getByTestId("org-record-hits")).getAllByRole("listitem");
    expect(items[1]!.querySelector('[data-testid="org-record-group"]')).toBeNull();
  });

  it("a hit with no group gets no heading, and a note goes under the name", async () => {
    draw(<RecordPicker vaultId={VAULT} find={async () => whole(hit("a", "Ann", { note: "Oslo", typeName: "Organization" }))} onPick={() => {}} />);
    const b = await screen.findByTestId("org-record-hit");
    expect(screen.queryByTestId("org-record-group")).toBeNull();
    expect(b.textContent).toBe("Ann Oslo");
    expect(b.querySelector("span")!.className).toContain("block");
    // typeName is for the drop-down only
    expect(b.querySelector("[aria-hidden]")).toBeNull();
  });

  it("exclude removes the addresses that must not be offered", async () => {
    draw(<RecordPicker vaultId={VAULT} exclude={[uri("a")]} find={async () => whole(hit("a", "Ann"), hit("b", "Ben"))} onPick={() => {}} />);
    await screen.findByText("Ben");
    expect(screen.queryByText("Ann")).toBeNull();
  });

  it("a pick passes the hit, empties the box and leaves the list", async () => {
    const onPick = vi.fn();
    const a = hit("a", "Ann");
    draw(<RecordPicker vaultId={VAULT} find={async () => whole(a)} onPick={onPick} />);
    fireEvent.change(box(), { target: { value: "an" } });
    fireEvent.click(await screen.findByTestId("org-record-hit"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(a);
    expect((box() as HTMLInputElement).value).toBe("");
  });

  it("a hit's mousedown is cancelled so the box keeps its focus", async () => {
    draw(<RecordPicker vaultId={VAULT} find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />);
    const b = await screen.findByTestId("org-record-hit");
    expect(fireEvent.mouseDown(b)).toBe(false);
  });

  it("says nothing was found, for a whole answer with no hits, with noneText", async () => {
    draw(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />);
    expect((await screen.findByTestId("org-record-none")).textContent).toBe("No organization record matches.");
    expect(screen.queryByTestId("org-record-hits")).toBeNull();
  });

  it("a partial answer with no hits says the list may not be whole (partialText), not that there is none", async () => {
    draw(<RecordPicker vaultId={VAULT} find={async () => ({ hits: [], complete: false })} onPick={() => {}} />);
    expect((await screen.findByTestId("org-record-none")).textContent).toBe("No match among the records read; the list may not be whole.");
  });

  it("an empty noneText says nothing", async () => {
    draw(<RecordPicker vaultId={VAULT} noneText="" find={async () => whole()} onPick={() => {}} />);
    await waitFor(() => expect(screen.queryByText("Searching organizations…")).toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("org-record-none")).toBeNull();
  });

  it("the missed-vaults note is drawn when the answer says so, hits or no hits", async () => {
    draw(<RecordPicker vaultId={VAULT} find={async () => ({ hits: [hit("a", "Ann")], complete: true, vaultsMissed: true })} onPick={() => {}} />);
    expect(await screen.findByText("Some vaults could not be searched.")).toBeTruthy();
    expect(screen.getByTestId("org-record-hit")).toBeTruthy();
  });

  it("says it is searching while the find runs, with pendingText", async () => {
    draw(<RecordPicker vaultId={VAULT} pendingText="Looking…" find={() => new Promise<PickerFind>(() => {})} onPick={() => {}} />);
    expect(await screen.findByText("Looking…")).toBeTruthy();
  });

  it("a failed find says it could not search (and that this is not 'none'), once: the host hook does not retry", async () => {
    const find = vi.fn(async (): Promise<PickerFind> => {
      throw new Error("down");
    });
    draw(<RecordPicker vaultId={VAULT} find={find} onPick={() => {}} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not search organizations. That is not a statement that there are none.");
    expect(screen.queryByTestId("org-record-none")).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("whenNoMatch is offered the trimmed text when the find finished with no hit, and not otherwise", async () => {
    const whenNoMatch = (t: string) => <button type="button">Add “{t}”</button>;
    draw(<RecordPicker vaultId={VAULT} whenNoMatch={whenNoMatch} find={async (t) => (t === "zed" ? whole() : whole(hit("a", "Ann")))} onPick={() => {}} />);
    await screen.findByTestId("org-record-hit");
    fireEvent.change(box(), { target: { value: "  zed " } });
    expect(await screen.findByRole("button", { name: "Add “zed”" }, { timeout: 4000 })).toBeTruthy();
    fireEvent.change(box(), { target: { value: "" } });
    await screen.findByTestId("org-record-hit", {}, { timeout: 4000 });
    expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
  });

  it("the placeholder, label, autoFocus and Cancel are the caller's", () => {
    const r = recording();
    const { rerender } = render(<RecordPicker vaultId={VAULT} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect((box() as HTMLInputElement).placeholder).toBe("Search organizations");
    expect(document.activeElement).toBe(box());
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    rerender(<RecordPicker vaultId={VAULT} label="Part of" placeholder="Find" autoFocus={false} onCancel={() => {}} find={async () => whole()} onPick={() => {}} />);
    expect((box("Part of") as HTMLInputElement).placeholder).toBe("Find");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("onAnswer hears a finished answer with the settled text, and not while the text is moving", async () => {
    const onAnswer = vi.fn();
    const answer = whole(hit("a", "Ann"));
    draw(<RecordPicker vaultId={VAULT} onAnswer={onAnswer} find={async () => answer} onPick={() => {}} />);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(answer, ""));
    onAnswer.mockClear();
    fireEvent.change(box(), { target: { value: "an" } });
    await new Promise((r) => setTimeout(r, 100));
    expect(onAnswer).not.toHaveBeenCalledWith(expect.anything(), "an");
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(answer, "an"), { timeout: 4000 });
  });

  it("onAnswer is silent when the picker is not enabled", async () => {
    const onAnswer = vi.fn();
    draw(<RecordPicker vaultId={VAULT} enabled={false} onAnswer={onAnswer} find={async () => whole()} onPick={() => {}} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("an answer that is not whole (whenIncomplete)", () => {
  const incomplete = (onRetry = () => {}) => ({ none: "The search was cut short.", hits: "More may exist.", onRetry });

  it("with no hit: its words and a Try again button that calls onRetry, in the none paragraph, and not the partialText", async () => {
    const onRetry = vi.fn();
    draw(<RecordPicker vaultId={VAULT} whenIncomplete={incomplete(onRetry)} find={async () => ({ hits: [], complete: false })} onPick={() => {}} />);
    const none = await screen.findByTestId("org-record-none");
    expect(none.textContent).toBe("The search was cut short. Try again");
    expect(screen.queryByText("No match among the records read; the list may not be whole.")).toBeNull();
    const again = within(none).getByRole("button", { name: "Try again" });
    expect(fireEvent.mouseDown(again)).toBe(false);
    fireEvent.click(again);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("with hits: every hit and the note under them, no Try again", async () => {
    draw(<RecordPicker vaultId={VAULT} whenIncomplete={incomplete()} find={async () => ({ hits: [hit("a", "Ann"), hit("b", "Ben")], complete: false })} onPick={() => {}} />);
    const list = await screen.findByTestId("org-record-hits");
    expect(within(list).getAllByTestId("org-record-hit")).toHaveLength(2);
    expect(within(list).getByText("More may exist.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a whole answer with no hit is the ordinary none line, whatever whenIncomplete says", async () => {
    draw(<RecordPicker vaultId={VAULT} whenIncomplete={incomplete()} find={async () => whole()} onPick={() => {}} />);
    expect((await screen.findByTestId("org-record-none")).textContent).toBe("No organization record matches.");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("an answer whose hits are all excluded counts as no hit: Try again is offered", async () => {
    draw(<RecordPicker vaultId={VAULT} exclude={[uri("a")]} whenIncomplete={incomplete()} find={async () => ({ hits: [hit("a", "Ann")], complete: false })} onPick={() => {}} />);
    expect((await screen.findByTestId("org-record-none")).textContent).toBe("The search was cut short. Try again");
  });

  it("the picker puts data-picker-keep on none of its own elements (only the caller's Try again beside it does)", async () => {
    const { container } = draw(<RecordPicker vaultId={VAULT} untilEngaged whenIncomplete={incomplete()} find={async () => ({ hits: [], complete: false })} onPick={() => {}} />);
    await screen.findByTestId("org-record-none");
    expect(container.querySelector("[data-picker-keep]")).toBeNull();
  });
});

describe("untilEngaged: the drop-down", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => hit(`h${i}`, `Hit ${i}`));

  it("shows nothing until the box is focused, and the type name of a hit only then, hidden from assistive technology", async () => {
    const find = vi.fn(async () => whole(hit("a", "Ann", { typeName: "Person", note: "Oslo" })));
    draw(<RecordPicker vaultId={VAULT} untilEngaged autoFocus={false} find={find} onPick={() => {}} />);
    await waitFor(() => expect(find).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("org-record-hit")).toBeNull();
    fireEvent.focus(box());
    const b = await screen.findByTestId("org-record-hit");
    expect(b.textContent).toBe("Ann OsloPerson");
    expect(b.querySelectorAll("[aria-hidden='true']")).toHaveLength(1);
    expect(b.querySelector("span")!.className).not.toContain("block");
  });

  it("a click opens it as well as focus does", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged autoFocus={false} find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />);
    fireEvent.click(box());
    expect(await screen.findByTestId("org-record-hit")).toBeTruthy();
  });

  it("cuts a whole list to 8 and says to type to search all", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => whole(...many(9))} onPick={() => {}} />);
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hits");
    expect(screen.getAllByTestId("org-record-hit")).toHaveLength(8);
    expect(screen.getByRole("note").textContent).toBe("Type to search all");
  });

  it("exactly 8 whole hits: no note", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => whole(...many(8))} onPick={() => {}} />);
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hits");
    expect(screen.getAllByTestId("org-record-hit")).toHaveLength(8);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("a partial page, even a short one, says to type to search all", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => ({ hits: many(2), complete: false })} onPick={() => {}} />);
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hits");
    expect(screen.getByRole("note").textContent).toBe("Type to search all");
  });

  it("an incomplete answer with whenIncomplete shows all its hits, past 8, and no type-to-search note", async () => {
    draw(
      <RecordPicker
        vaultId={VAULT}
        untilEngaged
        whenIncomplete={{ none: "cut", hits: "more", onRetry: () => {} }}
        find={async () => ({ hits: many(12), complete: false })}
        onPick={() => {}}
      />,
    );
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hits");
    expect(screen.getAllByTestId("org-record-hit")).toHaveLength(12);
    expect(screen.queryByText("Type to search all")).toBeNull();
    expect(screen.getByText("more")).toBeTruthy();
  });

  it("pending, none and error are drawn inside the drop-down when there is no hit", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged pendingText="Looking…" find={() => new Promise<PickerFind>(() => {})} onPick={() => {}} />);
    fireEvent.focus(box());
    expect(await screen.findByText("Looking…")).toBeTruthy();
    cleanup();
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => whole()} onPick={() => {}} />);
    fireEvent.focus(box());
    expect((await screen.findByTestId("org-record-none")).textContent).toBe("No organization record matches.");
    cleanup();
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => { throw new Error("x"); }} onPick={() => {}} />);
    fireEvent.focus(box());
    expect((await screen.findByRole("alert")).textContent).toContain("Could not search organizations.");
  });

  it("a pick closes the drop-down", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />);
    fireEvent.focus(box());
    fireEvent.click(await screen.findByTestId("org-record-hit"));
    expect(screen.queryByTestId("org-record-hit")).toBeNull();
  });

  it("the list's mousedown is cancelled, so a scrollbar click does not blur the box", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />);
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hit");
    expect(fireEvent.mouseDown(screen.getByTestId("org-record-hits"))).toBe(false);
  });

  it("blur does not close it", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />);
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hit");
    fireEvent.blur(box());
    expect(screen.getByTestId("org-record-hit")).toBeTruthy();
  });

  it("Escape closes it and is consumed; without an open list it is left alone", async () => {
    draw(<RecordPicker vaultId={VAULT} untilEngaged autoFocus={false} find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />);
    expect(fireEvent.keyDown(box(), { key: "Escape" })).toBe(true);
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hit");
    expect(fireEvent.keyDown(box(), { key: "Escape" })).toBe(false);
    expect(screen.queryByTestId("org-record-hit")).toBeNull();
  });

  it("Escape calls onCancel instead, when there is one, and is consumed even with nothing open", () => {
    const onCancel = vi.fn();
    const r = recording();
    render(<RecordPicker vaultId={VAULT} untilEngaged onCancel={onCancel} find={async () => whole()} onPick={() => {}} />, { wrapper: r.wrapper });
    expect(fireEvent.keyDown(box(), { key: "Escape" })).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("other keys do nothing: there is no arrow-key or Enter handling in the box", async () => {
    const onPick = vi.fn();
    draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => whole(hit("a", "Ann"))} onPick={onPick} />);
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hit");
    for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab"]) expect(fireEvent.keyDown(box(), { key })).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByTestId("org-record-hit")).toBeTruthy();
  });

  it("a mousedown outside closes it; inside the picker, and inside a [data-picker-keep] element elsewhere, it does not", async () => {
    draw(
      <div>
        <RecordPicker vaultId={VAULT} untilEngaged find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />
        <button type="button" data-picker-keep="" data-testid="keep">
          <span data-testid="keep-inner">Try again</span>
        </button>
        <p data-testid="away">elsewhere</p>
      </div>,
    );
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hit");
    fireEvent.mouseDown(box());
    expect(screen.getByTestId("org-record-hit")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("keep"));
    fireEvent.mouseDown(screen.getByTestId("keep-inner"));
    expect(screen.getByTestId("org-record-hit")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("away"));
    await waitFor(() => expect(screen.queryByTestId("org-record-hit")).toBeNull());
  });

  it("without untilEngaged a mousedown outside closes nothing: the list stays", async () => {
    draw(
      <div>
        <RecordPicker vaultId={VAULT} find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />
        <p data-testid="away">elsewhere</p>
      </div>,
    );
    await screen.findByTestId("org-record-hit");
    fireEvent.mouseDown(screen.getByTestId("away"));
    expect(screen.getByTestId("org-record-hit")).toBeTruthy();
  });

  it("the outside-click listener is removed when the picker unmounts", async () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const view = draw(<RecordPicker vaultId={VAULT} untilEngaged find={async () => whole(hit("a", "Ann"))} onPick={() => {}} />);
    fireEvent.focus(box());
    await screen.findByTestId("org-record-hit");
    view.unmount();
    expect(remove.mock.calls.some(([type]) => type === "mousedown")).toBe(true);
    remove.mockRestore();
  });
});

describe("the host cache decides what is reused", () => {
  it("two pickers with the same key share one find; a different label asks again", async () => {
    const find = vi.fn(async () => whole(hit("a", "Ann")));
    draw(
      <div>
        <RecordPicker vaultId={VAULT} label="One" find={find} onPick={() => {}} />
        <RecordPicker vaultId={VAULT} label="One" find={find} onPick={() => {}} />
        <RecordPicker vaultId={VAULT} label="Two" find={find} onPick={() => {}} />
      </div>,
    );
    await waitFor(() => expect(screen.getAllByTestId("org-record-hit")).toHaveLength(3));
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("a remount inside staleTime reuses the answer; with staleTime 0 it searches again", async () => {
    const client = newClient();
    const find = vi.fn(async () => whole(hit("a", "Ann")));
    const first = draw(<RecordPicker vaultId={VAULT} find={find} onPick={() => {}} />, client);
    await screen.findByTestId("org-record-hit");
    first.unmount();
    const second = draw(<RecordPicker vaultId={VAULT} find={find} onPick={() => {}} />, client);
    await screen.findByTestId("org-record-hit");
    expect(find).toHaveBeenCalledTimes(1);
    second.unmount();
    draw(<RecordPicker vaultId={VAULT} staleTime={0} find={find} onPick={() => {}} />, client);
    await waitFor(() => expect(find).toHaveBeenCalledTimes(2));
  });

  it("invalidating the key the caller gave searches again", async () => {
    const client = newClient();
    const find = vi.fn(async () => whole(hit("a", "Ann")));
    draw(<RecordPicker vaultId={VAULT} queryKey={["plan-search", "x"]} find={find} onPick={() => {}} />, client);
    await screen.findByTestId("org-record-hit");
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["plan-search", "x"] });
    });
    expect(find).toHaveBeenCalledTimes(2);
  });
});

// Ported from a card test file (two cases that render only the picker; same inputs and expectations).
describe("a newer keystroke wins", () => {
  it("shows only the newer text when the older search finishes last", async () => {
    let releaseOld: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const find = vi.fn(async (text: string) => {
      if (text === "old") {
        await held;
        return { hits: [{ uri: uri("old"), label: "Old hit" }], complete: true };
      }
      if (text === "new") return { hits: [{ uri: uri("new"), label: "New hit" }], complete: true, vaultsMissed: true };
      return { hits: [], complete: true };
    });
    draw(<OrgRecordPicker vaultId={VAULT} label="Search" find={find} untilEngaged pendingText="Searching…" onPick={() => {}} />, new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByRole("textbox", { name: "Search" }), "old");
    await waitFor(() => expect(find).toHaveBeenCalledWith("old"), { timeout: 4000 });
    await user.clear(screen.getByRole("textbox", { name: "Search" }));
    await user.type(screen.getByRole("textbox", { name: "Search" }), "new");
    expect(await screen.findByRole("button", { name: "New hit" }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText("Some vaults could not be searched.")).toBeTruthy();
    releaseOld();
    await waitFor(() => expect(find).toHaveBeenCalledWith("old"));
    expect(screen.queryByRole("button", { name: "Old hit" })).toBeNull();
    expect(screen.getByRole("button", { name: "New hit" })).toBeTruthy();
  });

  it("a short page with no missed vault does not say some vaults could not be searched", async () => {
    const find = async () => ({ hits: [{ uri: uri("a"), label: "Ada" }], complete: false });
    draw(<OrgRecordPicker vaultId={VAULT} label="Search" find={find} untilEngaged onPick={() => {}} />, new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByRole("textbox", { name: "Search" }), "ada");
    expect(await screen.findByRole("button", { name: "Ada" }, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText("Some vaults could not be searched.")).toBeNull();
  });
});
