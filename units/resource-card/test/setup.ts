// The Value card model names the endpoint types by the address of the ontology's terms, which the app sets once at start-up.
// Every test file starts with it set, and every test leaves the page empty.
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

beforeEach(() => setTermOrigin("https://ontology.example.test"));
afterEach(cleanup);
