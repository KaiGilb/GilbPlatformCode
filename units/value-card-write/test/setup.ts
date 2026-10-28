// The Value card model names the endpoint types by the address of the ontology's terms, which the app sets once at start-up.
// Every test file starts with it set.
import { beforeEach } from "vitest";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

beforeEach(() => setTermOrigin("https://ontology.example.test"));
