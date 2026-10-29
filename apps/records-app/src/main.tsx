import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@kaigilb/gilbplatformcode-signin/signin.css";
import "./styles.css";
import { App } from "./App";
import { initPlatform } from "./platform";
import { loadPreference, setPreference } from "./theme";

initPlatform();
setPreference(loadPreference());
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <App />
  </QueryClientProvider>,
);
