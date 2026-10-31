// Test-only. The host of `contact-rows` made of the REAL units (as the GilbPlatform provider builds it), and a `render` that puts it above the tree
// together with the host of the "Added by" line and a query client.
import type { ReactElement } from "react";
import { render as rtlRender } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContactRowsHostProvider, type ContactRowsHost } from "@kaigilb/gilbplatformcode-contact-rows";
import { AddedByHostContext, AddedByLine, HeldVisibilitySwitch } from "@kaigilb/gilbplatformcode-added-by";
import { useHomeDial } from "@kaigilb/gilbplatformcode-home-dial";
import { PhoneValue } from "@kaigilb/gilbplatformcode-phone-value";
import { noteServedVersion, saveRecordSidecar } from "@kaigilb/gilbplatformcode-record-sidecar-save";
import { SkillDepthNote, SkillPickerSheet } from "@kaigilb/gilbplatformcode-skill-picker-sheet";
import { SocialLogo, socialPlatformName } from "@kaigilb/gilbplatformcode-social-logo";

export const realHost: ContactRowsHost = {
  useHomeDial, saveRecordSidecar, noteServedVersion, PhoneValue, SkillPickerSheet, SkillDepthNote, SocialLogo, socialPlatformName, HeldVisibilitySwitch, AddedByLine,
};

export function mount(ui: ReactElement, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const tree = (el: ReactElement) => (
    <AddedByHostContext.Provider value={{ useShell: () => null }}>
      <QueryClientProvider client={qc}>
        <ContactRowsHostProvider host={realHost}>{el}</ContactRowsHostProvider>
      </QueryClientProvider>
    </AddedByHostContext.Provider>
  );
  const view = rtlRender(tree(ui));
  return { ...view, rerender: (el: ReactElement) => view.rerender(tree(el)) };
}
