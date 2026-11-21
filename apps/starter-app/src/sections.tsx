// The app's sections: one line in the menu each. A new app adds its record screens here.
import type { StarterSection } from "@kaigilb/gilbplatformcode-starter-app";
import { RecordsHome } from "./records/RecordsHome";

export const SECTIONS: readonly StarterSection[] = [
  // REPLACE: the starter has no records of its own. Put the screens for the app's first kind of record in src/records/
  // and give them a line here, for example { id: "plants", label: "Plants", render: (ctx) => <PlantList ctx={ctx} /> }.
  { id: "home", label: "Home", render: (ctx) => <RecordsHome ctx={ctx} /> },
];
