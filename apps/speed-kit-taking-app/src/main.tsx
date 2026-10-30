import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { cache } from "@kaigilb/gilbplatformcode-speed-kit";
import { App } from "./App";
import { installProofHooks } from "./proof";

installProofHooks(location.search, window, () => cache.sessionCache.clear());
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
