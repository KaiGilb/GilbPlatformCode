// app-shell: the frame of an app. The regions are the host's; the frame owns where they go.
export { ShellFrame, BottomButton, type ShellFrameProps } from "./ShellFrame";
export { ShellCoreContext, useShellCore, type ShellCoreValue } from "./ShellCore";
export {
  useShellLayout,
  readStoredLayout,
  SHELL_LAYOUT_DEFAULTS,
  LEFT_MIN,
  LEFT_MAX,
  RIGHT_MIN,
  RIGHT_MAX,
  type ShellLayout,
  type ShellLayoutApi,
  type ShellLayoutOptions,
} from "./useShellLayout";
export { PanelLeftIcon, PanelRightIcon } from "./PanelIcons";
