// The stand-ins the Value graph needs from the app (the picture source of the types, the reader of a type's definition), for the
// tests that put the graph on top of the write layer. `renderWithGraph` wraps a mount in them and in a browser's fake host.
import { render as rtlRender, type RenderResult } from "@testing-library/react";
import { useState, type ReactElement, type ReactNode } from "react";
import { createTypePictureSource, TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import type { Browser } from "./fakeHost";

// jsdom has no PointerEvent: a pointer event is a MouseEvent that carries the pointer's fields, so clientX and pointerId arrive.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub;
}

const source = {
  ...createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: () => "https://files.example.test" }),
  fetchTypePictureSrc: async () => null,
};

function Hosts({ children }: { children: ReactNode }) {
  const [reader] = useState<ReadTermDefinition>(() => async () => ({ state: "defined" as const, does: "A definition." }));
  return (
    <TypePictureSourceContext.Provider value={source}>
      <TermDefinitionContext.Provider value={reader}>{children}</TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>
  );
}

export function renderWithGraph(ui: ReactElement, browser: Browser): RenderResult {
  const Frame = browser.Frame;
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <Hosts>
        <Frame>{children}</Frame>
      </Hosts>
    ),
  });
}
