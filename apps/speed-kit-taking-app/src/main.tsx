import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { cache } from "@kaigilb/gilbplatformcode-speed-kit";
import { installProofHooks } from "./proof";
import { isLive } from "./mode";

installProofHooks(location.search, window, () => cache.sessionCache.clear());
// Chosen at build time: the other app is not part of the build.
void (async () => {
  const App = isLive() ? (await import("./live/LiveApp")).LiveApp : (await import("./App")).App;
  if (isLive()) await import("@kaigilb/gilbplatformcode-signin/signin.css");
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
})();
