// The Endpoint line: Subject and Reference, each a type from the ontology and some words; what each pick hands up, the "Find types" flow,
// and what the line reads from the host of the lines.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { TypeOption } from "@kaigilb/gilbplatformcode-type-chooser";
import { defaultEndpointFor, emptyValueCard, type EndpointPart, type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanEndpointBody, parseEndpointText } from "./index";
import { Card, TERMS, card, changes, hostCalls, lastChange, level, makeHost, part, type Props } from "../test/mount";
import { pics, renderEndpoint } from "../test/typeHosts";

afterEach(cleanup);

const ME = "https://h.example.test/base/e/me";
const option = (typeName: string, label = typeName, more: Partial<TypeOption> = {}): TypeOption => ({ id: `veda:${typeName}`, label, typeName, spec: null, kind: "type", ...more });
const found = (...options: TypeOption[]) => makeHost({ searchTypes: async (q) => { hostCalls.searched.push(q); return { options, reach: "Searched the example ontology.", degraded: false }; } });
const withEndpoint = (subject: EndpointPart, reference: EndpointPart, more: Partial<ValueCardData["endpoint"]> = {}): ValueCardData => {
  const c = card();
  return { ...c, endpoint: { ...c.endpoint, subject, reference, ...more } };
};
const mount = (start: ValueCardData, props: Props = {}, host?: ReturnType<typeof makeHost> | null) => renderEndpoint(<Card Body={PlanEndpointBody} start={start} props={props} />, host);
const subjectBlock = () => screen.getByTestId("plan-endpoint-subject");
const referenceBlock = () => screen.getByTestId("plan-endpoint-reference");
const pickRow = async (typeName: string) => userEvent.click(await screen.findByTestId(`type-chooser-option-veda:${typeName}`));

describe("parseEndpointText: an older 'Subject = X, reference = Y' text", () => {
  it("reads the two words, with = or :, a comma, a semicolon or a middle dot between them, in any case", () => {
    expect(parseEndpointText("Subject = mobile app, reference = AppUser")).toEqual({ subject: "mobile app", reference: "AppUser" });
    expect(parseEndpointText("subject: a ; Reference: b")).toEqual({ subject: "a", reference: "b" });
    expect(parseEndpointText("  SUBJECT=a·REFERENCE=b  ")).toEqual({ subject: "a", reference: "b" });
  });
  it("keeps a comma inside the subject (it splits before the word 'reference')", () => {
    expect(parseEndpointText("Subject = a, b, reference = c")).toEqual({ subject: "a, b", reference: "c" });
  });
  it("reads a blank subject as a subject of one space (the shape is all it checks)", () => {
    expect(parseEndpointText("Subject = , reference = b")).toEqual({ subject: " ", reference: "b" });
  });
  it("is null for any other shape", () => {
    for (const text of ["nonsense", "", "Subject = a", "reference = b, subject = a", "Subjective = a, reference = b"]) expect(parseEndpointText(text), text).toBeNull();
  });
});

describe("read: Subject = type (words) · Reference = type (words)", () => {
  it("shows each part with its type as a chip, its words in brackets, and the dot between", () => {
    mount(withEndpoint(part("mobile app", "repair devices", "SoftwareApplication"), part("AppUser", "run research", "User")));
    expect(subjectBlock().textContent).toBe("Subject =mobile app(repair devices)");
    expect(referenceBlock().textContent).toBe("Reference =AppUser(run research)");
    expect(within(subjectBlock()).getByTestId("plan-endpoint-type-chip").getAttribute("aria-label")).toBe("Type mobile app");
    expect(subjectBlock().parentElement?.textContent).toContain(" · ");
  });
  it("a part with no type says 'none', and no words shows no brackets", () => {
    mount(withEndpoint(part("", "words only"), part()));
    expect(subjectBlock().textContent).toBe("Subject =none(words only)");
    expect(referenceBlock().textContent).toBe("Reference =none");
  });
  it("an empty Endpoint draws nothing at all, and needs no host of the lines", () => {
    const { container } = mount(card(), {}, null);
    expect(container.textContent).toBe("");
  });
  it("the type's name is the last part of its address; a label wins, and a trailing slash or # is dropped", () => {
    mount(withEndpoint({ typeIri: `${TERMS}/base/t/Big%20Chair/`, typeLabel: "", words: "" }, { typeIri: `${TERMS}/base/t/Thing#`, typeLabel: "", words: "" }));
    expect(within(subjectBlock()).getByTestId("plan-endpoint-type-chip").textContent).toBe("Big%20Chair");
    expect(within(referenceBlock()).getByTestId("plan-endpoint-type-chip").textContent).toBe("Thing");
  });
  it("shows what the data holds: a Value's defaults are Thing and Person, a Development Resource's Organization and Person (the model's defaults, not the line's)", () => {
    const value = defaultEndpointFor(false);
    mount({ ...emptyValueCard(), endpoint: { ...emptyValueCard().endpoint, ...value } });
    expect([subjectBlock().textContent, referenceBlock().textContent]).toEqual(["Subject =Thing", "Reference =Person"]);
    expect(value.subject.typeIri).toBe(`${termOrigin()}/base/t/Thing`);
    cleanup();
    const resource = defaultEndpointFor(true);
    mount({ ...emptyValueCard(), resource: true, endpoint: { ...emptyValueCard().endpoint, ...resource } });
    expect([subjectBlock().textContent, referenceBlock().textContent]).toEqual(["Subject =Organization", "Reference =Person"]);
  });
  it("a source with words is shown; with none, nothing", () => {
    mount(withEndpoint(part("Thing"), part("Person"), { source: { text: "stakeholder interviews" } }));
    expect(document.body.textContent).toContain("Source: stakeholder interviews");
  });
  it("a chip asks the host of the lines: without it, the line throws an error that names the provider", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => mount(withEndpoint(part("Thing"), part()), {}, null)).toThrowError(/value-line-kit: wrap the card in <ValueLinesHostContext\.Provider/);
    } finally {
      console.error = quiet;
    }
  });
  it("the type popover shows the definition and the link, and 'Open in Ontology' calls the host's opener with the type's name", async () => {
    mount(withEndpoint(part("mobile app", "", "SoftwareApplication"), part()));
    await userEvent.click(screen.getByTestId("plan-endpoint-type-chip"));
    const pop = await screen.findByTestId("plan-endpoint-type-popover");
    await within(pop).findByText("A phone program.");
    expect(within(pop).getByRole("link", { name: /Open in GilbVeda/ }).getAttribute("href")).toBe(`${TERMS}/base/t/SoftwareApplication`);
    await userEvent.click(within(pop).getByRole("button", { name: "Open in Ontology" }));
    expect(hostCalls.openOntologyConcept).toEqual(["SoftwareApplication"]);
  });
  it("the 'Open in Ontology' button is drawn even when the host has no opener (it then does nothing)", async () => {
    mount(withEndpoint(part("mobile app", "", "SoftwareApplication"), part()), {}, makeHost({ openOntologyConcept: undefined }));
    await userEvent.click(screen.getByTestId("plan-endpoint-type-chip"));
    const pop = await screen.findByTestId("plan-endpoint-type-popover");
    await userEvent.click(within(pop).getByRole("button", { name: "Open in Ontology" }));
    expect(hostCalls.openOntologyConcept).toEqual([]);
  });
});

describe("click to type: picking a type", () => {
  // Ported from the app's PlanEndpointTypes test "clicking Subject and picking a type makes one change with the type IRI" (the app mocked the type chooser with one button; here the chooser is the type-chooser unit over the host's search).
  it("clicking the Subject and picking a type hands up one change with the type's address and label; the other parts and lists are the same objects", async () => {
    const s = card({ levels: [level("Goal", 3)] });
    mount(s, { canEdit: true, selfId: ME }, found(option("Person", "Person")));
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    expect(screen.getByTestId("plan-endpoint-picker-subject")).toBeTruthy();
    await pickRow("Person");
    expect(changes).toHaveLength(1);
    const next = lastChange();
    expect(next.endpoint.subject).toEqual({ typeIri: `${TERMS}/base/t/Person`, typeLabel: "Person", words: "" });
    expect(next.endpoint.reference).toBe(s.endpoint.reference);
    expect(next.endpoint.source).toEqual({ statedBy: ME });
    expect(next.levels).toBe(s.levels);
    expect(next.scale).toBe(s.scale);
    expect(screen.queryByTestId("plan-endpoint-picker-subject")).toBeNull();
  });
  it("the address is built from the term origin at the moment of the pick", async () => {
    mount(card(), { canEdit: true }, found(option("Thing")));
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    const { setTermOrigin } = await import("@kaigilb/gilbplatformcode-term-origin");
    setTermOrigin("https://other.example.test");
    await pickRow("Thing");
    expect(lastChange().endpoint.subject.typeIri).toBe("https://other.example.test/base/t/Thing");
  });
  // Ported from the app's PlanEndpointTypes test "Escape cancels the picker without a change" (there the Escape key went to the mock's button; here it goes to a row of the real chooser).
  it("Escape on a row of the picker cancels it without a change (Escape in the search box does not: the box keeps its keys)", async () => {
    mount(card(), { canEdit: true }, found(option("Person")));
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    const box = await screen.findByRole("searchbox");
    expect(document.activeElement).toBe(box);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("plan-endpoint-picker-subject")).toBeTruthy();
    fireEvent.keyDown(await screen.findByTestId("type-chooser-option-veda:Person"), { key: "Escape" });
    expect(screen.queryByTestId("plan-endpoint-picker-subject")).toBeNull();
    expect(changes).toHaveLength(0);
    expect(screen.getByLabelText("Edit Subject type")).toBeTruthy();
  });
  it("Escape that cancels a picker stops there; Escape in an Edit picker with no type to go back to is left for the layer around", async () => {
    const around = vi.fn();
    renderEndpoint(
      <div onKeyDown={around}>
        <Card Body={PlanEndpointBody} start={card()} props={{ canEdit: true }} />
      </div>,
      found(option("Person")),
    );
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    fireEvent.keyDown(await screen.findByTestId("type-chooser-option-veda:Person"), { key: "Escape" });
    expect(screen.queryByTestId("plan-endpoint-picker-subject")).toBeNull();
    expect(around).not.toHaveBeenCalled();
    cleanup();
    renderEndpoint(
      <div onKeyDown={around}>
        <Card Body={PlanEndpointBody} start={card()} props={{ editing: true }} />
      </div>,
      found(option("Person")),
    );
    fireEvent.keyDown((await screen.findAllByTestId("type-chooser-option-veda:Person"))[0]!, { key: "Escape" });
    expect(around).toHaveBeenCalledTimes(1);
  });
  it("the chooser searches with the host's search, says the host's reach before the first answer, and draws the host's icons", async () => {
    const search = vi.fn(async (q: string) => ({ options: [option("Person")], reach: `Reach for "${q}"`, degraded: false }));
    const host = makeHost({ searchTypes: search, blankReach: "Type to search the example ontology.", renderTypeIcon: (o) => <i data-icon={o.typeName} /> });
    mount(card(), { canEdit: true }, host);
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe("Type to search the example ontology.");
    await screen.findByTestId("type-chooser-option-veda:Person");
    expect(search).toHaveBeenCalledWith("");
    expect(screen.getByTestId("type-chooser-scope").textContent).toBe('Reach for ""');
    expect(document.querySelector('[data-icon="Person"]')).toBeTruthy();
    // The chooser is for picking only: no "name only" hint in the rows, and the label names the part.
    expect(screen.getByText("Subject type")).toBeTruthy();
    expect(document.body.textContent).not.toContain("name only");
  });
  it("the Reference's picker offers 'No reference', which clears the whole part, words too", async () => {
    mount(withEndpoint(part("Thing", "a thing"), part("Person", "a user")), { canEdit: true, selfId: ME }, found(option("Person")));
    await userEvent.click(screen.getByLabelText("Edit Reference type"));
    await userEvent.click(screen.getByRole("button", { name: "No reference" }));
    expect(lastChange().endpoint.reference).toEqual({ typeIri: "", typeLabel: "", words: "" });
    expect(lastChange().endpoint.subject.words).toBe("a thing");
    expect(screen.queryByTestId("plan-endpoint-picker-reference")).toBeNull();
  });
  it("the Subject's picker has no 'No reference' button", async () => {
    mount(card(), { canEdit: true }, found(option("Person")));
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    expect(screen.queryByRole("button", { name: "No reference" })).toBeNull();
  });
  it("a type already chosen can be changed: the label is a button with the type's name, and the arrow opens the popover", async () => {
    mount(withEndpoint(part("mobile app", "", "SoftwareApplication"), part()), { canEdit: true }, found(option("Tablet", "tablet app")));
    expect(screen.getByLabelText("Edit Subject type").textContent).toBe("mobile app");
    expect(screen.getByLabelText("About type mobile app").textContent).toBe("↗");
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    await pickRow("Tablet");
    expect(lastChange().endpoint.subject).toEqual({ typeIri: `${TERMS}/base/t/Tablet`, typeLabel: "tablet app", words: "" });
  });
  it("the words are an input in place: Enter sends them once, untrimmed, with the type kept", async () => {
    const s = withEndpoint(part("Thing"), part("Person"));
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByLabelText("Edit Subject words"));
    fireEvent.change(screen.getByLabelText("Edit Subject words"), { target: { value: " mobile app " } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().endpoint.subject).toEqual({ ...s.endpoint.subject, words: " mobile app " });
    expect(lastChange().endpoint.reference).toBe(s.endpoint.reference);
  });
  it("a part with no words and no type offers 'Add subject type' and 'words'", () => {
    mount(card(), { canEdit: true });
    expect(screen.getByLabelText("Edit Subject type").textContent).toBe("Add subject type");
    expect(screen.getByLabelText("Edit Reference type").textContent).toBe("Add reference type");
    expect(subjectBlock().textContent).toContain("(words)");
    expect(screen.queryByLabelText(/^About type/)).toBeNull();
  });
});

describe("the older text: greyed, with the button that finds types for its words", () => {
  const oldCard = (text = "Subject = mobile app, reference = AppUser") => withEndpoint(part(), part(), { text });
  // Ported from the app's PlanEndpointTypes test "an old text record shows greyed, with the find-types button" (with its parseEndpointText("nonsense") line, in the first describe above).
  it("the text is shown greyed in place of the parts, with the 'Find types' button, for a person who may edit or in Edit", () => {
    mount(oldCard(), { canEdit: true });
    expect(screen.getByTestId("plan-endpoint-legacy").textContent).toBe("Subject = mobile app, reference = AppUser");
    expect(screen.getByRole("button", { name: "Find types for 'mobile app' and 'AppUser'" })).toBeTruthy();
    cleanup();
    mount(oldCard(), { editing: true });
    expect(screen.getByRole("button", { name: "Find types for 'mobile app' and 'AppUser'" })).toBeTruthy();
  });
  it("read-only, only the text is shown: no parts, no button", () => {
    mount(oldCard());
    expect(screen.getByTestId("plan-endpoint-legacy")).toBeTruthy();
    expect(screen.queryByTestId("plan-endpoint-subject")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("text that is not in the shape is shown with no button", () => {
    mount(oldCard("a mobile app for users"), { canEdit: true });
    expect(screen.getByTestId("plan-endpoint-legacy").textContent).toBe("a mobile app for users");
    expect(screen.queryByRole("button", { name: /Find types/ })).toBeNull();
  });
  it("once a part has a type or words the text is no longer shown", () => {
    mount(withEndpoint(part(), part("", "x"), { text: "Subject = a, reference = b" }), { canEdit: true });
    expect(screen.queryByTestId("plan-endpoint-legacy")).toBeNull();
  });
  it("'Use these types' flow: one search for each word, with the very function the chooser uses; nothing is written until the person confirms", async () => {
    const search = vi.fn(async (q: string) => ({
      options: q === "mobile app" ? [option("SoftwareApplication", "Software application"), option("Other")] : q === "AppUser" ? [option("User", "User")] : [],
      reach: "r",
      degraded: false,
    }));
    const s = oldCard();
    mount(s, { canEdit: true, selfId: ME }, makeHost({ searchTypes: search }));
    await userEvent.click(screen.getByRole("button", { name: "Find types for 'mobile app' and 'AppUser'" }));
    await screen.findByTestId("plan-endpoint-found");
    expect(search.mock.calls.map((c) => c[0]).sort()).toEqual(["AppUser", "mobile app"]);
    expect(screen.getByTestId("plan-endpoint-found").textContent).toContain("Subject: Software application · Reference: User");
    expect(changes).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Use these types" }));
    expect(changes).toHaveLength(1);
    expect(lastChange().endpoint.subject).toEqual({ typeIri: `${TERMS}/base/t/SoftwareApplication`, typeLabel: "Software application", words: "mobile app" });
    expect(lastChange().endpoint.reference).toEqual({ typeIri: `${TERMS}/base/t/User`, typeLabel: "User", words: "AppUser" });
    expect(lastChange().endpoint.text).toBe(s.endpoint.text);
    expect(lastChange().endpoint.source).toEqual({ statedBy: ME });
    expect(screen.queryByTestId("plan-endpoint-legacy")).toBeNull();
  });
  it("the finder and the chooser share one search function", async () => {
    const search = vi.fn(async (q: string) => ({ options: [option("Person")], reach: "r", degraded: false }));
    mount(withEndpoint(part(), part(), { text: "Subject = a, reference = b" }), { canEdit: true }, makeHost({ searchTypes: search }));
    await userEvent.click(screen.getByRole("button", { name: "Find types for 'a' and 'b'" }));
    await screen.findByTestId("plan-endpoint-found");
    expect(search.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "b"]);
    await userEvent.click(screen.getByLabelText("Edit Subject type"));
    await screen.findByTestId("type-chooser-option-veda:Person");
    expect(search.mock.calls.map((c) => c[0]).sort()).toEqual(["", "a", "b"]);
  });
  it("only one word found: 'no type found' for the other, and its words are kept with no type", async () => {
    const host = makeHost({ searchTypes: async (q) => ({ options: q === "a" ? [option("Thing")] : [], reach: "r", degraded: false }) });
    mount(withEndpoint(part(), part(), { text: "Subject = a, reference = b" }), { canEdit: true }, host);
    await userEvent.click(screen.getByRole("button", { name: "Find types for 'a' and 'b'" }));
    expect((await screen.findByTestId("plan-endpoint-found")).textContent).toContain("Subject: Thing · Reference: no type found");
    await userEvent.click(screen.getByRole("button", { name: "Use these types" }));
    expect(lastChange().endpoint.subject).toEqual({ typeIri: `${TERMS}/base/t/Thing`, typeLabel: "Thing", words: "a" });
    expect(lastChange().endpoint.reference).toEqual({ typeIri: "", typeLabel: "", words: "b" });
  });
  it("nothing found: no 'Use these types'; 'Dismiss' brings the find button back", async () => {
    mount(oldCard(), { canEdit: true }, makeHost());
    await userEvent.click(screen.getByRole("button", { name: /Find types/ }));
    expect((await screen.findByTestId("plan-endpoint-found")).textContent).toContain("Subject: no type found · Reference: no type found");
    expect(screen.queryByRole("button", { name: "Use these types" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("button", { name: /Find types/ })).toBeTruthy();
    expect(changes).toHaveLength(0);
  });
  it("a search that fails is the same as nothing found", async () => {
    mount(oldCard(), { canEdit: true }, makeHost({ searchTypes: async () => { throw new Error("offline"); } }));
    await userEvent.click(screen.getByRole("button", { name: /Find types/ }));
    expect((await screen.findByTestId("plan-endpoint-found")).textContent).toContain("no type found");
  });
  it("the button is disabled while the search runs", async () => {
    let release: (v: { options: TypeOption[]; reach: string; degraded: boolean }) => void = () => {};
    const gate = new Promise<{ options: TypeOption[]; reach: string; degraded: boolean }>((r) => (release = r));
    mount(oldCard(), { canEdit: true }, makeHost({ searchTypes: () => gate }));
    const btn = screen.getByRole("button", { name: /Find types/ }) as HTMLButtonElement;
    await userEvent.click(btn);
    expect(btn.disabled).toBe(true);
    release({ options: [], reach: "r", degraded: false });
    await screen.findByTestId("plan-endpoint-found");
  });
  it("in Edit, the same flow works", async () => {
    mount(oldCard(), { editing: true, selfId: ME }, found(option("Thing")));
    await userEvent.click(screen.getByRole("button", { name: /Find types/ }));
    await screen.findByTestId("plan-endpoint-found");
    await userEvent.click(screen.getByRole("button", { name: "Use these types" }));
    expect(lastChange().endpoint.subject.typeIri).toBe(`${TERMS}/base/t/Thing`);
  });
});

describe("Edit", () => {
  it("each part has its label, its type with a Change button, and a box for the words; no picker while a type is chosen", () => {
    mount(withEndpoint(part("mobile app", "repair", "SoftwareApplication"), part("AppUser", "", "User")), { editing: true });
    expect(within(subjectBlock()).getByRole("button", { name: "Change type" })).toBeTruthy();
    expect((screen.getByLabelText("Subject words") as HTMLInputElement).value).toBe("repair");
    expect((screen.getByLabelText("Subject words") as HTMLInputElement).placeholder).toBe("mobile app");
    expect(screen.queryByTestId("plan-endpoint-picker-subject")).toBeNull();
  });
  it("a part with no type opens the picker at once, with the search box focused; with a chosen type 'Change type' opens it and Escape on a row closes it", async () => {
    mount(withEndpoint(part("Thing"), part()), { editing: true }, found(option("Person")));
    await screen.findByTestId("plan-endpoint-picker-reference");
    expect(screen.queryByTestId("plan-endpoint-picker-subject")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Change type" }));
    const picker = await screen.findByTestId("plan-endpoint-picker-subject");
    fireEvent.keyDown(await within(picker).findByTestId("type-chooser-option-veda:Person"), { key: "Escape" });
    expect(screen.queryByTestId("plan-endpoint-picker-subject")).toBeNull();
    expect(changes).toHaveLength(0);
  });
  it("the picker of a part with no type cannot be cancelled with Escape (there is nothing to go back to)", async () => {
    mount(card(), { editing: true }, found(option("Person")));
    fireEvent.keyDown((await screen.findAllByTestId("type-chooser-option-veda:Person"))[0]!, { key: "Escape" });
    expect(screen.getByTestId("plan-endpoint-picker-subject")).toBeTruthy();
  });
  it("a pick sets the type and keeps the words", async () => {
    const s = withEndpoint(part("", "mobile app"), part("Person"));
    mount(s, { editing: true, selfId: ME }, found(option("Thing")));
    const picker = await screen.findByTestId("plan-endpoint-picker-subject");
    await userEvent.click(await within(picker).findByTestId("type-chooser-option-veda:Thing"));
    expect(lastChange().endpoint.subject).toEqual({ typeIri: `${TERMS}/base/t/Thing`, typeLabel: "Thing", words: "mobile app" });
    expect(lastChange().endpoint.source).toEqual({ statedBy: ME });
  });
  it("the words box: Enter sends once, leaving sends once, an unchanged box sends nothing", async () => {
    mount(withEndpoint(part("Thing", "a"), part("Person")), { editing: true });
    const box = screen.getByLabelText("Subject words");
    await userEvent.type(box, "b{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().endpoint.subject.words).toBe("ab");
    fireEvent.blur(box);
    expect(changes).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Reference words"), { target: { value: "users" } });
    fireEvent.blur(screen.getByLabelText("Reference words"));
    expect(changes).toHaveLength(2);
    expect(lastChange().endpoint.reference.words).toBe("users");
  });
  it("the Reference has a 'No reference' box once it has a type or words; ticking it clears the part; the Subject has none", async () => {
    mount(withEndpoint(part("Thing", "a"), part("Person", "u")), { editing: true });
    expect(within(subjectBlock()).queryByLabelText("No reference")).toBeNull();
    await userEvent.click(within(referenceBlock()).getByLabelText("No reference"));
    expect(lastChange().endpoint.reference).toEqual({ typeIri: "", typeLabel: "", words: "" });
    expect(lastChange().endpoint.subject.words).toBe("a");
    cleanup();
    mount(withEndpoint(part("Thing"), part()), { editing: true }, found(option("Person")));
    expect(within(referenceBlock()).queryByLabelText("No reference")).toBeNull();
  });
  it("the source box is open", () => {
    mount(card(), { editing: true }, found(option("Person")));
    expect(document.querySelector('[data-plan-source="Endpoint source"]')?.getAttribute("data-editing")).toBe("true");
  });
});

describe("what goes up", () => {
  it("the Endpoint's unknown members are carried, not enumerable; the person is the source only of an Endpoint with none", async () => {
    const s = withEndpoint(part("Thing"), part("Person"), { source: { text: "interviews" } });
    const raw = { unknownMember: 1 };
    Object.defineProperty(s.endpoint, "raw", { value: raw, enumerable: false });
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByLabelText("Edit Subject words"));
    fireEvent.change(screen.getByLabelText("Edit Subject words"), { target: { value: "w" } });
    await userEvent.keyboard("{Enter}");
    const next = lastChange().endpoint as unknown as { raw?: unknown; source: unknown };
    expect(next.raw).toBe(raw);
    expect(Object.keys(next)).not.toContain("raw");
    expect(next.source).toBe(s.endpoint.source);
  });
});

describe("the pictures of the types (ported from the app's TypePictures tests, with the picture source and the definition reader as stand-ins)", () => {
  const SUBJECT = part("mobile app", "repair mobile devices", "SoftwareApplication");
  const REFERENCE = part("AppUser", "execute ICT user research", "User");
  const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const wrap = (ui: ReactElement) => renderEndpoint(ui);
  const endpointOf = (over: Props = {}) => <Card Body={PlanEndpointBody} start={withEndpoint(SUBJECT, REFERENCE)} props={{ canEdit: true, ...over }} />;

  it("picture present: a 20 px <img> before the label, the arrow right after the label (before the words), 44 px hit area, named", async () => {
    pics.map = { SoftwareApplication: "https://files.example.test/files/app.png", User: "https://files.example.test/files/user.png" };
    wrap(endpointOf());
    const subject = screen.getByTestId("plan-endpoint-subject");
    await waitFor(() => expect(subject.querySelector("img")).not.toBeNull());
    const img = subject.querySelector<HTMLImageElement>("img")!;
    expect(img.getAttribute("src")).toBe("https://files.example.test/files/app.png");
    expect(img.style.width).toBe("20px");
    expect(img.style.height).toBe("20px");
    const pic = within(subject).getByRole("button", { name: "Subject type: mobile app" });
    expect(pic.className).toContain("min-h-11");
    expect(pic.className).toContain("min-w-11");
    const label = within(subject).getByRole("button", { name: "Edit Subject type" });
    const arrow = within(subject).getByRole("button", { name: "About type mobile app" });
    expect(arrow.textContent).toBe("↗");
    expect(before(pic, label)).toBe(true);
    expect(before(label, arrow)).toBe(true);
    const words = within(subject).getByRole("button", { name: "Edit Subject words" });
    expect(before(arrow, words)).toBe(true);
    // The Reference part has its own.
    const reference = screen.getByTestId("plan-endpoint-reference");
    await waitFor(() => expect(reference.querySelector("img")?.getAttribute("src")).toBe("https://files.example.test/files/user.png"));
    expect(within(reference).getByRole("button", { name: "Reference type: AppUser" })).toBeTruthy();
  });

  it("picture absent: no <img>, no <svg>, no picture button", async () => {
    wrap(endpointOf());
    const subject = screen.getByTestId("plan-endpoint-subject");
    await new Promise((r) => setTimeout(r, 50));
    expect(subject.querySelector("img")).toBeNull();
    expect(subject.querySelector("svg")).toBeNull();
    expect(within(subject).queryByRole("button", { name: /^Subject type:/ })).toBeNull();
    expect(within(subject).getByRole("button", { name: "Edit Subject type" })).toBeTruthy();
    expect(within(subject).getByRole("button", { name: "About type mobile app" })).toBeTruthy();
  });

  it("a click on the picture opens the same popover", async () => {
    pics.map = { SoftwareApplication: "https://files.example.test/files/app.png" };
    wrap(endpointOf());
    const pic = await screen.findByRole("button", { name: "Subject type: mobile app" });
    fireEvent.click(pic);
    const pop = await screen.findByTestId("plan-endpoint-type-popover");
    expect(within(pop).getByText("A phone program.")).toBeTruthy();
    expect(within(pop).getByRole("link", { name: /Open in GilbVeda/ }).getAttribute("href")).toBe(`${TERMS}/base/t/SoftwareApplication`);
  });

  it("not in place (read-only): the picture still shows before the type chip", async () => {
    pics.map = { SoftwareApplication: "https://files.example.test/files/app.png" };
    wrap(endpointOf({ canEdit: false }));
    const subject = screen.getByTestId("plan-endpoint-subject");
    const pic = await within(subject).findByRole("button", { name: "Subject type: mobile app" });
    const chip = within(subject).getByRole("button", { name: "Type mobile app" });
    expect(before(pic, chip)).toBe(true);
  });

  it("edit mode: the picture sits next to the chosen type", async () => {
    pics.map = { SoftwareApplication: "https://files.example.test/files/app.png" };
    wrap(endpointOf({ editing: true }));
    const subject = screen.getByTestId("plan-endpoint-subject");
    const pic = await within(subject).findByRole("button", { name: "Subject type: mobile app" });
    const chip = within(subject).getByRole("button", { name: "Type mobile app" });
    expect(before(pic, chip)).toBe(true);
    expect(subject.querySelector("img")!.style.width).toBe("20px");
  });

  it("a broken picture (the image fails to load) draws nothing", async () => {
    pics.map = { SoftwareApplication: "https://files.example.test/files/gone.png" };
    wrap(endpointOf());
    const subject = screen.getByTestId("plan-endpoint-subject");
    const img = await waitFor(() => {
      const found = subject.querySelector("img");
      expect(found).not.toBeNull();
      return found!;
    });
    fireEvent.error(img);
    await waitFor(() => expect(subject.querySelector("img")).toBeNull());
    expect(within(subject).queryByRole("button", { name: /^Subject type:/ })).toBeNull();
  });
});

