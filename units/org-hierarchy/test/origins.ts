// Test support: the two settings every unit reads, set once per test file to the example hosts.
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

setBaseOrigin("https://example.test");
setTermOrigin("https://onto.example.test");
