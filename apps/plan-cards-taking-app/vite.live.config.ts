// Only for the live sign-in check against production. 5197 is one of the two local origins
// production admits (RuleRigdevProdFirstPartyOrigin); it is GilbApp's port, so GilbApp's
// dev server must be off. Start this only through `npm run dev:live`.
import { mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, {
  server: { port: 5197, strictPort: true },
  preview: { port: 5197, strictPort: true },
});
