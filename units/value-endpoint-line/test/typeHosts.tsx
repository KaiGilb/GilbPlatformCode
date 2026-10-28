// What the Endpoint line's type pieces need, as stand-ins: the picture source of the types and the reader of a type's definition.
// `renderEndpoint` wraps a mount of the lines (test/mount.tsx) in them.
import { beforeEach, vi } from "vitest";
import { type RenderResult } from "@testing-library/react";
import { useState, type ReactElement, type ReactNode } from "react";
import { createTypePictureSource, TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import type { ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { render, TERMS } from "./mount";

/** The answers of the picture source: the type name, then its picture address or null (no picture). */
export const pics = { map: {} as Record<string, string | null> };
/** The reader of a type's definition; a test says what it answers. */
export const read = vi.fn<ReadTermDefinition>();

const source = {
  ...createTypePictureSource({ termOrigin: TERMS, originOf: () => "https://files.example.test" }),
  fetchTypePictureSrc: async (name: string) => pics.map[name] ?? null,
};

beforeEach(() => {
  pics.map = {};
  read.mockReset();
  read.mockResolvedValue({ state: "defined", does: "A phone program." });
});

function TypeHosts({ children }: { children: ReactNode }) {
  // A new reader for each mount: a definition is held per reader, so no mount sees another's.
  const [reader] = useState<ReadTermDefinition>(() => (name: string) => read(name));
  return (
    <TypePictureSourceContext.Provider value={source}>
      <TermDefinitionContext.Provider value={reader}>{children}</TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>
  );
}

export function renderEndpoint(ui: ReactElement, host?: ValueLinesHost | null): RenderResult {
  return render(<TypeHosts>{ui}</TypeHosts>, host);
}
