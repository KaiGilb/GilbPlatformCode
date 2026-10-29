// The ontology origin is a setting the app sets once at start-up; the unit reads it when it checks a skill's referent. Set for every test.
import { afterEach, beforeEach } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

beforeEach(() => setTermOrigin("https://ontology.example.test"));
afterEach(() => resetTermOrigin());
