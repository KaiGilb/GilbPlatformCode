/**
 * The website hide-on-scroll-header unit: a fixed header that clears, solidifies, hides and returns with the scroll.
 */
export { default as HideOnScrollHeader } from "./HideOnScrollHeader.vue";
export { createHeaderController, browserEnv, isSolid, DEFAULT_CONFIG, INPUT_EVENTS } from "./headerState";
export type { HeaderConfig, HeaderController, HeaderEnv, HeaderView } from "./headerState";
