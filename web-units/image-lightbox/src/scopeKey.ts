import type { InjectionKey } from "vue";

/** Provided by LightboxScope so a ProseImg inside it stays a plain picture (the scope opens it). */
export const lightboxScopeKey: InjectionKey<boolean> = Symbol("lightbox-scope");
