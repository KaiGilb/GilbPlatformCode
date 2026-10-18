/**
 * The website section menu unit: the header button that says where you are, and the large panel
 * that takes the visitor anywhere on the site. The site passes its menu as data.
 */
export { default as SectionMenu } from "./SectionMenu.vue";
export { currentSectionId, normalisePath, placesFor, type WebMenu, type WebMenuCta, type WebMenuLink, type WebMenuSection } from "./menu";
export { DEFAULT_WEB_LABELS, HOVER_CLICK_GRACE_MS, HOVER_INTENT_MS, type WebMenuLabels } from "./labels";
export { rememberSectionMenuTarget } from "./target";
