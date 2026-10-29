import { expect, test } from "vitest";
import config from "../vite.config";

test("4.1: the dev server is pinned to 5251 with strictPort, and no other port is set", () => {
  expect((config as { server?: unknown }).server).toEqual({ port: 5251, strictPort: true });
});
