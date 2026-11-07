import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PicturePickButtons } from "./index";

afterEach(cleanup);

const img = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const take = () => screen.getByLabelText("Take photo") as HTMLInputElement;
const choose = (name = "Choose photo") => screen.getByLabelText(name) as HTMLInputElement;
const axeIds = async (): Promise<string[]> =>
  (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v) => v.id);

describe("PicturePickButtons", () => {
  test("two buttons with the source's words", () => {
    render(<PicturePickButtons onPick={() => {}} />);
    expect(screen.getByText("Take photo")).toBeTruthy();
    expect(screen.getByText("Choose photo")).toBeTruthy();
    expect(document.querySelectorAll("label.btn.secondary.grow").length).toBe(2);
    expect(document.querySelector("div.row")).toBeTruthy();
  });

  test("Take photo: accept image/*, capture environment, never multiple", () => {
    render(<PicturePickButtons onPick={() => {}} />);
    expect(take().getAttribute("accept")).toBe("image/*");
    expect(take().getAttribute("capture")).toBe("environment");
    expect(take().multiple).toBe(false);
  });

  test("Take photo is never multiple, even when multiple is set", () => {
    render(<PicturePickButtons onPick={() => {}} multiple />);
    expect(take().multiple).toBe(false);
    expect(take().getAttribute("capture")).toBe("environment");
  });

  test("Choose: accept image/*, not multiple by default", () => {
    render(<PicturePickButtons onPick={() => {}} />);
    expect(choose().getAttribute("accept")).toBe("image/*");
    expect(choose().multiple).toBe(false);
  });

  test("choosing a file calls onPick([file]) and resets the input value", async () => {
    const onPick = vi.fn();
    render(<PicturePickButtons onPick={onPick} />);
    const f = img("ann.jpg");
    await userEvent.upload(choose(), f);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith([f]);
    expect(choose().value).toBe("");
  });

  test("taking a photo calls onPick([file]) and resets the input value", async () => {
    const onPick = vi.fn();
    render(<PicturePickButtons onPick={onPick} />);
    const f = img("shot.jpg");
    await userEvent.upload(take(), f);
    expect(onPick).toHaveBeenCalledWith([f]);
    expect(take().value).toBe("");
  });

  test("the value is reset only after onPick was called (the order stays)", async () => {
    const seen: string[] = [];
    render(<PicturePickButtons onPick={() => seen.push(`value=[${choose().value}]`)} />);
    await userEvent.upload(choose(), img("ann.jpg"));
    expect(seen.length).toBe(1);
    expect(seen[0]).not.toBe("value=[]");
    expect(choose().value).toBe("");
  });

  test("choosing the same file twice calls twice", async () => {
    const onPick = vi.fn();
    render(<PicturePickButtons onPick={onPick} />);
    const f = img("ann.jpg");
    await userEvent.upload(choose(), f);
    await userEvent.upload(choose(), f);
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(onPick).toHaveBeenNthCalledWith(2, [f]);
  });

  test("multiple: the Choose input is multiple and the words switch", () => {
    render(<PicturePickButtons onPick={() => {}} multiple />);
    expect(choose("Choose photos").multiple).toBe(true);
    expect(screen.queryByText("Choose photo")).toBeNull();
  });

  test("multiple: three files reach onPick in order, a .txt is dropped", async () => {
    const onPick = vi.fn();
    render(<PicturePickButtons onPick={onPick} multiple />);
    const a = img("a.jpg");
    const t = new File(["x"], "notes.txt", { type: "text/plain" });
    const b = img("b.jpg");
    const c = img("c.jpg");
    await userEvent.setup({ applyAccept: false }).upload(choose("Choose photos"), [a, t, b, c]);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toEqual([a, b, c]);
  });

  test("a non-picture alone calls onPick with an empty list", async () => {
    const onPick = vi.fn();
    render(<PicturePickButtons onPick={onPick} />);
    await userEvent.setup({ applyAccept: false }).upload(choose(), new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(onPick).toHaveBeenCalledWith([]);
  });

  test("words replace the defaults one by one", () => {
    render(<PicturePickButtons onPick={() => {}} multiple words={{ takePhoto: "Foto", choosePhotos: "Fotos" }} />);
    expect(screen.getByText("Foto")).toBeTruthy();
    expect(screen.getByText("Fotos")).toBeTruthy();
  });

  test("disabled: both inputs disabled and both labels aria-disabled", () => {
    render(<PicturePickButtons onPick={() => {}} disabled />);
    expect(take().disabled).toBe(true);
    expect(choose().disabled).toBe(true);
    for (const l of Array.from(document.querySelectorAll("label"))) expect(l.getAttribute("aria-disabled")).toBe("true");
  });

  test("not disabled: inputs enabled and no aria-disabled", () => {
    render(<PicturePickButtons onPick={() => {}} />);
    expect(take().disabled).toBe(false);
    expect(choose().disabled).toBe(false);
    for (const l of Array.from(document.querySelectorAll("label"))) expect(l.hasAttribute("aria-disabled")).toBe(false);
  });

  test("axe: no violations on the buttons, enabled, disabled and multiple", async () => {
    render(<PicturePickButtons onPick={() => {}} multiple />);
    expect(await axeIds()).toEqual([]);
    cleanup();
    render(<PicturePickButtons onPick={() => {}} disabled />);
    expect(await axeIds()).toEqual([]);
  });
});
