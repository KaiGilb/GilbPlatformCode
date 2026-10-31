// A stand-in for the app's "Add information" sheet (which is not in this unit): it lists the groups of the card that are not shown and can
// be added, and a pick opens that group, as the app's sheet does (`mode.openGroup(kind)`, then closes). Used only by the tests.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";

export function AddInformationSheet() {
  const mode = useCardMode();
  const open = mode.managed && mode.canEdit && mode.chooserOpen;
  if (!open) return null;
  const items = [...mode.groups.values()].filter((g) => !g.shown && g.addable);
  return (
    <div role="dialog" aria-label="Add information" data-testid="add-information-sheet">
      {items.map((g) => (
        <button
          key={g.kind}
          type="button"
          data-testid={`add-information-${g.kind}`}
          onClick={() => {
            mode.openGroup(g.kind);
            mode.setChooserOpen(false);
          }}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}

/** Open the chooser from the top "+" and pick the kind of information named `label`. */
export async function addInformation(label: string): Promise<void> {
  await userEvent.click(screen.getByTestId("card-add-info"));
  const sheet = screen.getByTestId("add-information-sheet");
  await userEvent.click(within(sheet).getByRole("button", { name: label }));
}
