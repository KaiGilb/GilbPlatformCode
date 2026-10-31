// Only for the live check against production. 5251 is one of the two local origins production admits (RuleRigdevProdFirstPartyOrigin);
// it is the origin records-app's proven live run used. Start this only through `npm run dev:live`.
import { mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, {
  server: { port: 5251, strictPort: true },
  preview: { port: 5251, strictPort: true },
});
