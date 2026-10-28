// Rendering and picking helpers shared by the tests.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { Frame, makeHost, newClient } from "./fakeHost";

export function mount(ui: ReactElement, h = makeHost(), o: { editing?: boolean; canEdit?: boolean } = {}) {
  const client = newClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Frame host={h.host} pickerHost={h.pickerHost} sourceHost={h.sourceHost} client={client} editing={o.editing} canEdit={o.canEdit}>
      {children}
    </Frame>
  );
  const view = render(ui, { wrapper });
  return { ...h, view, client };
}

export async function typeInto(label: string, text: string) {
  const user = userEvent.setup();
  const box = screen.getByRole("textbox", { name: label });
  await user.click(box);
  if (text) await user.type(box, text);
  return user;
}

/** Type into the Impacts picker and click the hit with this label. */
export async function pick(text: string, hitLabel: string) {
  const user = await typeInto("Impacts", text);
  const hits = await screen.findByTestId("plan-link-hits");
  await user.click(await within(hits).findByText(hitLabel));
  return user;
}
