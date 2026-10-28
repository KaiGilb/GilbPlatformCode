// Builders and a mount for the Levels line's tests: a card with a Scale that names Country and Task, and the line inside the host.
import { screen } from "@testing-library/react";
import { blankVariable, emptyValueCard, type ScaleVariable, type ValueCardData, type ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValueLevelsBody } from "../src/index";
import { Card, card, render, type Props } from "./mount";

export const ME = "https://h.example.test/base/e/me";
export const scale = (more: Partial<ValueCardData["scale"]> = {}): ValueCardData["scale"] => ({ ...emptyValueCard().scale, ...more });
export const variable = (name: string, more: Partial<ScaleVariable> = {}): ScaleVariable => ({ ...blankVariable(name), ...more });
export const options = (...names: string[]) => names.map((name) => ({ name, definition: "" }));

/** A Scale that names Task and Country, with Country defined (Norway, Sweden). */
export const scaled = (more: Partial<ValueCardData> = {}): ValueCardData =>
  card({ scale: scale({ rate: "per [Task] in [Country]" }), variables: [variable("Country", { options: options("Norway", "Sweden"), defaultOption: "Norway" })], ...more });

export const mount = (start: ValueCardData, props: Props = {}, host?: Parameters<typeof render>[1]) => render(<Card Body={PlanValueLevelsBody} start={start} props={props} />, host);
export const viewBlock = () => screen.getByTestId("plan-levels-view");
/** The text of each level line of the read view, in the order drawn. */
export const lines = () => [...viewBlock().querySelectorAll("p")].map((p) => p.textContent ?? "");
export type { ValueLevel };
