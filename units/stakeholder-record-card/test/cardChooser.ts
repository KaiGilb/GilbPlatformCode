// s8 "card look": the card shows only what it has; a kind of information it does not show is added from the "Add information"
// chooser (the "+" at the top of the card, or "+ Add Information" at its foot). A test that needs an EMPTY group does what a person does.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Open the chooser from the top "+" and pick the kind of information named `label`. */
export async function addInformation(label: string): Promise<void> {
  await userEvent.click(screen.getByTestId("card-add-info"));
  const sheet = screen.getByTestId("add-information-sheet");
  await userEvent.click(within(sheet).getByRole("button", { name: label }));
}
