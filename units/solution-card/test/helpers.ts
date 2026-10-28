// Small helpers the card tests share.
import { act } from "@testing-library/react";

/** The `data-group` of every Plan group on the page, in page order. */
export function planKinds(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="card-group"]')]
    .map((el) => el.getAttribute("data-group") ?? "")
    .filter((kind) => kind.startsWith("plan-"));
}

/** Let the queued writes and the finds settle. */
export const settle = async (ms = 30) => {
  for (let i = 0; i < 6; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms / 6));
    });
};
