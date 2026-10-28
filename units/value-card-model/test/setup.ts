// Every test runs with a type origin set, as an app sets it once at start-up, and with it forgotten afterwards.
import { afterEach, beforeEach } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

beforeEach(() => setTermOrigin("https://ontology.example.test"));
afterEach(() => resetTermOrigin());
