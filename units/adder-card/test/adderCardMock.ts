// TEST SEAM ONLY, never imported by product code. Copied from GilbApp (private repo `KaiGilb/GilbApp`, commit
// `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/base/adderCard.testkit.ts`, unchanged except this header.
//
// Stands in for the adder-card module in a test that wants "the signed-in person's own card is X" without a session, a vault list or an
// own-card finding:
//
//     vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) => (await import("<path>/adderCardMock")).adderCardMock(await orig(), async () => stater.uri));
//
// `cardOf` answers the viewer's own card IRI, or rejects (the card could not be made or read). `useAdderCard` reads it once per mount;
// `state()` may say `noOwnVault`; `resolve` is what a WRITE path awaits; `find` is the read-only form; `adderCardOf` is the non-hook form.
import { useEffect, useState } from "react";

export function adderCardMock<T extends object>(real: T, cardOf: () => Promise<string>, state: () => { noOwnVault?: boolean } = () => ({})): T & { useAdderCard: (enabled?: boolean) => unknown; adderCardOf: () => Promise<string> } {
  return {
    ...real,
    adderCardOf: () => cardOf(),
    useAdderCard: (enabled = true) => {
      const [card, setCard] = useState<string | null>(null);
      useEffect(() => {
        if (!enabled) return;
        let live = true;
        cardOf().then(
          (c) => live && setCard(c),
          () => live && setCard(null),
        );
        return () => {
          live = false;
        };
      }, [enabled]);
      return {
        card,
        pending: false,
        noOwnVault: state().noOwnVault === true,
        error: null,
        resolve: () => cardOf(),
        find: () => cardOf().catch(() => null),
      };
    },
  } as never;
}
