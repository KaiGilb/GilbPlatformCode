// @vitest-environment jsdom
// New. The small parts on their own: the compact lines, the names of the text fields, the text row and the three address lines. GilbApp tested these only through the whole card.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { emptyDraft } from "@kaigilb/gilbplatformcode-place-draft";
import { AddressLineRows, AddressTextRow, CompactAddress, LINE_SLOTS, compactLines, termWords, textFieldLabel } from "./index";

afterEach(cleanup);
const place = (id: string, label: string, type = "City") => ({ id, label, type, memberOf: [] as string[] });

describe("compactLines", () => {
  it("the filled parts in the editor's order: Street, Address 1, Address 2, 'Postal Code City', 'Region, Country'", () => {
    const d = {
      ...emptyDraft(),
      streetLine: " Storgata 1 ",
      addressLine1: "c/o Hansen",
      addressLine2: "Floor 2",
      postalCode: "0150",
      place: { city: place("c", "Oslo"), region: place("r", "Oslo", "GeoAdminArea"), country: place("n", "Norway", "Country") },
    };
    expect(compactLines(d)).toEqual([
      { key: "street", text: "Storgata 1" },
      { key: "line1", text: "c/o Hansen" },
      { key: "line2", text: "Floor 2" },
      { key: "postal-city", text: "0150 Oslo" },
      { key: "region-country", text: "Oslo, Norway", countryId: "n" },
    ]);
  });

  it("an empty or blank part adds nothing, and a line with no picked country carries no country id", () => {
    expect(compactLines(emptyDraft())).toEqual([]);
    const d = { ...emptyDraft(), streetLine: "   ", postalCode: "0150", place: { city: null, region: place("r", "Oslo", "GeoAdminArea"), country: null } };
    expect(compactLines(d)).toEqual([{ key: "postal-city", text: "0150" }, { key: "region-country", text: "Oslo" }]);
    expect("countryId" in compactLines(d)[1]!).toBe(false);
  });

  it("the postal code keeps its leading zero", () => {
    expect(compactLines({ ...emptyDraft(), postalCode: "0150" })[0]!.text).toBe("0150");
  });
});

describe("the names of the text fields", () => {
  it("the lines are the table's, without the street", () => {
    expect(LINE_SLOTS.map((r) => r.term)).toEqual(["addressLine1", "addressLine2", "postalCode"]);
  });
  it("the master's label when it has resolved, else the term in words", () => {
    expect(termWords("addressLine1")).toBe("Address line1");
    expect(textFieldLabel("addressLine1", undefined)).toBe("Address line1");
    expect(textFieldLabel("addressLine1", { addressLine1: "Address 1" })).toBe("Address 1");
    expect(textFieldLabel("postalCode", { addressLine1: "Address 1" })).toBe("Postal code");
  });
});

describe("AddressTextRow", () => {
  it("is a labelled box: change, leave and Enter are handed on; the hint and the pill sit beside it", () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const onEnter = vi.fn();
    render(<AddressTextRow id="x" label="Street.." value="a" placeholder="Storgata 1" hint="Kept here" rungPill={<b data-testid="pill" />} onChange={onChange} onBlur={onBlur} onEnter={onEnter} />);
    const box = screen.getByLabelText("Street..") as HTMLInputElement;
    expect(box.placeholder).toBe("Storgata 1");
    fireEvent.change(box, { target: { value: "ab" } });
    expect(onChange).toHaveBeenCalledWith("ab");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onEnter).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(box, { key: "a" });
    expect(onEnter).toHaveBeenCalledTimes(1);
    fireEvent.blur(box);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Kept here")).toBeTruthy();
    expect(screen.getByTestId("pill")).toBeTruthy();
  });
});

describe("AddressLineRows", () => {
  it("one box per line under Street, labelled from the master, each handing its term on", () => {
    const onText = vi.fn();
    render(<AddressLineRows idPrefix="line" draft={{ ...emptyDraft(), addressLine1: "a1", postalCode: "0150" }} labels={{ addressLine1: "Address 1", addressLine2: "Address 2", postalCode: "Postal Code" }} onText={onText} />);
    expect(screen.getByLabelText("Address 1")).toBeTruthy();
    expect((screen.getByLabelText("Postal Code") as HTMLInputElement).value).toBe("0150");
    fireEvent.change(screen.getByLabelText("Address 2"), { target: { value: "x" } });
    expect(onText).toHaveBeenCalledWith("addressLine2", "x");
    expect(document.querySelector("#line-line2")).toBeTruthy();
  });
});

describe("CompactAddress", () => {
  it("nothing filled and a way to open it: 'Add address details'; nothing filled and no way: nothing", () => {
    const { unmount } = render(<CompactAddress heading="home" lines={[]} onOpen={() => {}} />);
    expect(screen.getByText("Add address details")).toBeTruthy();
    unmount();
    const { container } = render(<CompactAddress heading="home" lines={[]} />);
    expect(container.textContent).toBe("");
  });
});
