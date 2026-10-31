// New tests (the source has none): the row draws a text box when no picker is supplied, the host's picker when one is, a choice when
// the master publishes a value set, and reads the value set by term through the query it names. `fetch` is a fake; the master is
// the term-slots origin.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { FieldPickersProvider, type FieldPickerProps, type FieldPickers } from "@kaigilb/gilbplatformcode-field-row";
import { openPortalRoots } from "@kaigilb/gilbplatformcode-open-popups";
import { __resetTermSlotsForTest } from "@kaigilb/gilbplatformcode-term-slots";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { PersonFieldRow } from "./index";

const ORIGIN = "https://ontology.example.test";
let calls: string[];
let docs: Record<string, unknown>;
let client: QueryClient;

beforeEach(() => {
  calls = [];
  docs = {};
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setTermOrigin(ORIGIN);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const d = docs[url];
      return new Response(JSON.stringify(d ?? {}), { status: d === undefined ? 404 : 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  cleanup();
  openPortalRoots.length = 0;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  resetTermOrigin();
  __resetTermSlotsForTest();
});

const doc = (name: string) => `${ORIGIN}/base/a/${name}`;

function fakePicker(name: string, seen: FieldPickerProps[]) {
  return function Fake(props: FieldPickerProps) {
    seen.push(props);
    return (
      <div data-testid={`picker-${name}`}>
        <button onClick={() => props.onPick("picked")}>pick</button>
      </div>
    );
  };
}

function mount(ui: ReactNode, pickers?: FieldPickers) {
  const inner = pickers ? <FieldPickersProvider pickers={pickers}>{ui}</FieldPickersProvider> : ui;
  return render(
    <QueryClientProvider client={client}>
      <CardModeProvider canEdit startEditing>
        {inner}
      </CardModeProvider>
    </QueryClientProvider>,
  );
}

const row = (p: Partial<React.ComponentProps<typeof PersonFieldRow>> = {}) => (
  <PersonFieldRow label="Web" value="example.test" termName={null} readOnly={false} onCommit={() => {}} {...p} />
);
const open = (label = "Web") => fireEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));

describe("a plain field", () => {
  it("shows the label and the value, and a click opens a text box that holds the value", () => {
    mount(row());
    expect(screen.getByText("Web").tagName).toBe("P");
    expect(screen.getByRole("button", { name: "Edit Web" }).textContent).toBe("example.test");
    open();
    expect((screen.getByRole("textbox", { name: "Edit Web" }) as HTMLInputElement).value).toBe("example.test");
  });

  it("commits the trimmed new value through onCommit, on Enter", () => {
    const onCommit = vi.fn();
    mount(row({ onCommit }));
    open();
    const box = screen.getByRole("textbox", { name: "Edit Web" });
    fireEvent.change(box, { target: { value: "  new.example.test " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("new.example.test");
  });

  it("commits nothing when the value is unchanged, or on Escape", () => {
    const onCommit = vi.fn();
    mount(row({ onCommit }));
    open();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit Web" }), { key: "Enter" });
    open();
    const box = screen.getByRole("textbox", { name: "Edit Web" });
    fireEvent.change(box, { target: { value: "other" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a read-only row cannot be opened", () => {
    mount(row({ readOnly: true }));
    const b = screen.getByRole("button", { name: "Edit Web" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("an empty value reads 'Add <label>' and opens empty", () => {
    mount(row({ value: "" }));
    expect(screen.getByRole("button", { name: "Edit Web" }).textContent).toBe("Add web");
    open();
    expect((screen.getByRole("textbox", { name: "Edit Web" }) as HTMLInputElement).value).toBe("");
  });
});

describe("the picker", () => {
  const cases = [
    ["contactLanguage", "contact-language", "Language"],
    ["timeZone", "time-zone", "Time zone"],
  ] as const;

  it.each(cases)("a %s row is edited in the host's picker when it supplies one, given the label and the stored value", (term, kind, label) => {
    const seen: FieldPickerProps[] = [];
    const onCommit = vi.fn();
    const pickers: FieldPickers = kind === "contact-language" ? { ContactLanguagePicker: fakePicker(kind, seen) } : { TimeZonePicker: fakePicker(kind, seen) };
    mount(row({ label, value: "stored", termName: term, onCommit }), pickers);
    open(label);
    expect(screen.getByTestId(`picker-${kind}`)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(seen[0]).toMatchObject({ label, value: "stored" });
    fireEvent.click(screen.getByText("pick"));
    expect(onCommit).toHaveBeenCalledWith("picked");
  });

  it.each(cases)("a %s row is a text box when the host supplies no picker", (term, _kind, label) => {
    mount(row({ label, value: "stored", termName: term }));
    open(label);
    expect(screen.getByRole("textbox", { name: `Edit ${label}` })).toBeTruthy();
  });

  it("a time-zone row does not use the contact-language picker, nor the other way", () => {
    const seen: FieldPickerProps[] = [];
    mount(row({ label: "Time zone", termName: "timeZone" }), { ContactLanguagePicker: fakePicker("contact-language", seen) });
    open("Time zone");
    expect(screen.queryByTestId("picker-contact-language")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Edit Time zone" })).toBeTruthy();
  });

  it("a birthday row is picked with the birthday picker, which needs no host", () => {
    mount(row({ label: "Birthday", value: "1961-03-14", termName: "birthday" }));
    open("Birthday");
    expect(screen.getByTestId("birthday-picker")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each([["webAddress"], ["TimeZone"], ["timezone"], ["Birthday"], [""], ["level"]])("a field of term %j is never picked, even with every host picker supplied", (term) => {
    const seen: FieldPickerProps[] = [];
    mount(row({ termName: term }), { ContactLanguagePicker: fakePicker("a", seen), TimeZonePicker: fakePicker("b", seen) });
    open();
    expect(screen.getByRole("textbox", { name: "Edit Web" })).toBeTruthy();
    expect(screen.queryByTestId("birthday-picker")).toBeNull();
    expect(seen).toHaveLength(0);
  });

  it("a row with no term (not addressable) is a text box and asks the master nothing", async () => {
    mount(row({ termName: null }), { TimeZonePicker: fakePicker("b", []) });
    open();
    expect(screen.getByRole("textbox", { name: "Edit Web" })).toBeTruthy();
    await Promise.resolve();
    expect(calls).toHaveLength(0);
  });
});

describe("the value set", () => {
  it("is read by the term, and the edit is a choice among its members", async () => {
    docs[doc("level")] = { "a:valueSet": ["Stakeholder", "Business"] };
    mount(row({ label: "Level", value: "Business", termName: "level" }));
    await waitFor(() => expect(calls).toEqual([doc("level")]));
    await waitFor(() => expect(client.getQueryData(["mynet", "term-value-set", "level"])).toEqual(["Stakeholder", "Business"]));
    open("Level");
    const select = screen.getByRole("combobox", { name: "Edit Level" }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "Stakeholder", "Business"]);
    expect(select.value).toBe("Business");
  });

  it("asks for the term the row holds, whatever its name", async () => {
    docs[doc("interestKind")] = { "a:valueSet": ["Music", "Sport"] };
    mount(row({ label: "Interest", value: "Music", termName: "interestKind" }));
    await waitFor(() => expect(client.getQueryData(["mynet", "term-value-set", "interestKind"])).toEqual(["Music", "Sport"]));
    expect(calls).toEqual([doc("interestKind")]);
  });

  it("picking a member commits it", async () => {
    docs[doc("level")] = { "a:valueSet": ["Stakeholder", "Business"] };
    const onCommit = vi.fn();
    mount(row({ label: "Level", value: "Business", termName: "level", onCommit }));
    await waitFor(() => expect(client.getQueryData(["mynet", "term-value-set", "level"])).toBeTruthy());
    open("Level");
    fireEvent.change(screen.getByRole("combobox", { name: "Edit Level" }), { target: { value: "Stakeholder" } });
    expect(onCommit).toHaveBeenCalledWith("Stakeholder");
  });

  it("a stored value outside the published set is still offered", async () => {
    docs[doc("level")] = { "a:valueSet": ["Stakeholder"] };
    mount(row({ label: "Level", value: "Legacy", termName: "level" }));
    await waitFor(() => expect(client.getQueryData(["mynet", "term-value-set", "level"])).toBeTruthy());
    open("Level");
    const select = screen.getByRole("combobox", { name: "Edit Level" }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "Legacy", "Stakeholder"]);
  });

  it("a term that publishes no set is free text", async () => {
    docs[doc("level")] = { "a:label": "Level" };
    mount(row({ label: "Level", value: "x", termName: "level" }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await waitFor(() => expect(client.getQueryState(["mynet", "term-value-set", "level"])?.status).toBe("success"));
    open("Level");
    expect(screen.getByRole("textbox", { name: "Edit Level" })).toBeTruthy();
  });

  it("a master that does not answer leaves free text", async () => {
    mount(row({ label: "Level", value: "x", termName: "level" })); // docs empty: a 404
    await waitFor(() => expect(client.getQueryState(["mynet", "term-value-set", "level"])?.status).toBe("success"));
    open("Level");
    expect(screen.getByRole("textbox", { name: "Edit Level" })).toBeTruthy();
  });

  it("is held for the page: the query never goes stale, and is keyed by the term", async () => {
    docs[doc("level")] = { "a:valueSet": ["A"] };
    mount(row({ termName: "level" }));
    await waitFor(() => expect(client.getQueryData(["mynet", "term-value-set", "level"])).toEqual(["A"]));
    const q = client.getQueryCache().find({ queryKey: ["mynet", "term-value-set", "level"] })!;
    expect(q.isStale()).toBe(false);
    expect((q.observers[0]!.options as { staleTime?: number }).staleTime).toBe(Infinity);
  });

  it("with no term the query is disabled (no read, no data)", async () => {
    mount(row({ termName: null }));
    await Promise.resolve();
    const q = client.getQueryCache().find({ queryKey: ["mynet", "term-value-set", ""] });
    expect(q?.state.fetchStatus ?? "idle").toBe("idle");
    expect(q?.state.data).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
