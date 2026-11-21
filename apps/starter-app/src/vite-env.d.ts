/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** A test rig's platform origin. Left unset, the app uses GilbPlatform production. */
  readonly VITE_PLATFORM_ORIGIN?: string;
  /** A test rig's sign-in origin. Left unset, the app uses GilbPlatform production. */
  readonly VITE_ID_ORIGIN?: string;
}
