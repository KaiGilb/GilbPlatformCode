// Rendering and picking helpers shared by the tests.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { Frame, makeHost, newClient } from "./fakeHost";

export function mount(ui: ReactElement, h = makeHost(), o: { editing?: boolean; canEdit?: boolean } = {}) {
  const client = newClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Frame host={h.host} pickerHost={h.pickerHost} client={client} editing={o.editing} canEdit={o.canEdit}>
      {children}
    </Frame>
  );
  const view = render(ui, { wrapper });
  return { ...h, view, client };
}

/** Click into a picker's box (found by its label) and type. */
export async function typeInto(label: string, text: string) {
  const user = userEvent.setup();
  const box = screen.getByRole("textbox", { name: label });
  await user.click(box);
  if (text) await user.type(box, text);
  return user;
}

/** Type into the picker and click the hit with this label. */
export async function pick(label: string, text: string, hitLabel: string, hitsTestId = "plan-link-hits") {
  const user = await typeInto(label, text);
  const hits = await screen.findByTestId(hitsTestId);
  await user.click(await within(hits).findByText(hitLabel));
  return user;
}

export const notices = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls.map((c) => c[0]);

export async function settle(check: () => void) {
  await waitFor(check);
}
