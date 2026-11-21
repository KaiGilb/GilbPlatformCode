// One entry. `vite` (and the build) run against the platform named in settings.ts; `vite --mode fake` runs against a fake
// platform that lives in the page. The fake is loaded only in that mode, so no build of the app holds it.
import { boot } from "./App";
import { SETTINGS } from "./settings";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

if (import.meta.env.MODE === "fake") {
  void import("./fake").then(({ startFake }) => {
    const fake = startFake(SETTINGS);
    boot(fake.settings, root, fake.note);
  });
} else {
  boot(SETTINGS, root);
}
