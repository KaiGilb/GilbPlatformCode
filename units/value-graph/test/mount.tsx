// What the graph needs from the app, as stand-ins for the tests: the picture source of the types, the reader of a
// type's definition and the term origin. `render` wraps every mount in them.
import { beforeEach, afterEach, vi } from "vitest";
import { render as rtlRender, type RenderOptions, type RenderResult } from "@testing-library/react";
import { useState, type ReactElement, type ReactNode } from "react";
import { createTypePictureSource, TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

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

/** The answers of the picture source: the type name, then its picture address or null (no picture). */
export const pics = { map: {} as Record<string, string | null> };
/** The reader of a type's definition; a test says what it answers. */
export const read = vi.fn<ReadTermDefinition>();

const source = {
  ...createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: () => "https://files.example.test" }),
  fetchTypePictureSrc: async (name: string) => pics.map[name] ?? null,
};

beforeEach(() => {
  pics.map = {};
  setTermOrigin("https://ontology.example.test");
});
afterEach(() => resetTermOrigin());

function Hosts({ children }: { children: ReactNode }) {
  // A new reader for each mount: a definition is held per reader, so no mount sees another's.
  const [reader] = useState<ReadTermDefinition>(() => (name: string) => read(name));
  return (
    <TypePictureSourceContext.Provider value={source}>
      <TermDefinitionContext.Provider value={reader}>{children}</TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>
  );
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">): RenderResult {
  return rtlRender(ui, { wrapper: Hosts, ...options });
}
