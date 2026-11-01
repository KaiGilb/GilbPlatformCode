/**
 * The section menu unit: the header button that says where you are, and the large panel that
 * takes you anywhere in the app. The host passes its sections as data and its acts as an `api`.
 */
export {
  SectionMenu,
  Kbd,
  DEFAULT_LABELS,
  HOVER_INTENT_MS,
  HOVER_OPEN_DELAY_MS,
  HOVER_CLICK_GRACE_MS,
  CLOSE_MIN_WIDTH,
  type SectionMenuProps,
  type SectionMenuHandle,
  type SectionMenuLabels,
  type SectionStatus,
  type MenuFooterAction,
  type MenuSizeClass,
} from "./SectionMenu";
export {
  visibleSections,
  menuOptionsOf,
  placesFor,
  forYouFor,
  menuCommands,
  toCommand,
  type MenuOption,
  type MenuSection,
  type MenuList,
  type MenuExtraCommand,
  type MenuCommand,
  type MenuCommandWords,
} from "./menuList";
export { MenuIcon, isMenuIconKey, type MenuIconKey } from "./MenuIcon";
export { createIntentChannel, type Intent, type IntentChannel, type IntentChannelValue } from "./intent";
