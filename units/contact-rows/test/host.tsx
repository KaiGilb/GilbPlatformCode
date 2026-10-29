// The fake host of the tests: the six app components as test doubles, the app's writer over the fake records, and a `render` that puts the host above the tree.
import { useState, type ReactElement } from "react";
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { ContactRowsHostProvider, type ContactRowsHost } from "../src/contactRowsHost";
import { AddedByLine } from "./AddedByLine";
import { HeldVisibilitySwitch } from "./HeldVisibilitySwitch";
import { PhoneValue } from "./PhoneValue";
import { noteServedVersion, saveRecordSidecar } from "./recordSidecarSave";
import { SkillDepthNote } from "./SkillDepthNote";
import { SkillPickerSheet } from "./SkillPickerSheet";
import { SocialLogo, socialPlatformName } from "./SocialLogo";

/** The app's `useHomeDial` for a card with no place claims: the code box starts at "+" (""). A hook, as in the app. */
function useHomeDial(): string {
  const [dial] = useState("");
  return dial;
}

/** Everything the app supplies. */
export const fullHost: ContactRowsHost = {
  useHomeDial,
  saveRecordSidecar,
  noteServedVersion,
  PhoneValue,
  SkillPickerSheet,
  SkillDepthNote,
  SocialLogo,
  socialPlatformName,
  HeldVisibilitySwitch,
  AddedByLine,
};

/** Render under a host (default: the full one). */
export function render(ui: ReactElement, options?: RenderOptions & { host?: ContactRowsHost }) {
  const { host = fullHost, ...rest } = options ?? {};
  const wrap = (el: ReactElement) => <ContactRowsHostProvider host={host}>{el}</ContactRowsHostProvider>;
  const r = rtlRender(wrap(ui), rest);
  return { ...r, rerender: (el: ReactElement) => r.rerender(wrap(el)) };
}
