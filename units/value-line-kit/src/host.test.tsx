import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render as rtlRender } from "@testing-library/react";
import { ValueLinesHostContext, useValueLinesHost, type ValueLinesHost } from "./index";
import { makeHost } from "../test/mount";

function Probe({ out }: { out: { host?: ValueLinesHost } }) {
  out.host = useValueLinesHost();
  return null;
}
afterEach(cleanup);

describe("the host of the lines", () => {
  it("without a provider, a line that asks for it throws an error that names the provider", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => rtlRender(<Probe out={{}} />)).toThrowError(/value-line-kit: wrap the card in <ValueLinesHostContext\.Provider/);
    } finally {
      console.error = quiet;
    }
  });
  it("with one, hands back the same object it was given (no copy, so a hook member keeps its identity)", () => {
    const host = makeHost();
    const out: { host?: ValueLinesHost } = {};
    rtlRender(
      <ValueLinesHostContext.Provider value={host}>
        <Probe out={out} />
      </ValueLinesHostContext.Provider>,
    );
    expect(out.host).toBe(host);
  });
  it("a context with null as its value is the same as no provider", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() =>
        rtlRender(
          <ValueLinesHostContext.Provider value={null}>
            <Probe out={{}} />
          </ValueLinesHostContext.Provider>,
        ),
      ).toThrowError(/ValueLinesHostContext/);
    } finally {
      console.error = quiet;
    }
  });
});
