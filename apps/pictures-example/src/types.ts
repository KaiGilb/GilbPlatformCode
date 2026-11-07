import type { PictureFailure } from "@kaigilb/gilbplatformcode-picture-errors";
import type { RefusalDetail } from "@kaigilb/gilbplatformcode-refusal-detail";
import type { PictureCopy } from "@kaigilb/gilbplatformcode-picture-set";

/** Who is signed in and which vault their pictures live in. */
export interface Session {
  principal: string;
  vaultOrigin: string;
  /** The vault root, read from the vault list; never composed. */
  vaultRoot: string;
}

export type TileStatus = "saving" | "waiting" | "stuck" | "stored" | "wifi";

export interface Tile {
  key: string;
  status: TileStatus;
  /** The local thumbnail, shown at once and until the stored one is wanted. */
  previewUrl: string | null;
  /** The stored thumbnail's address (null while the picture is only on this device). */
  fileUri: string | null;
  /** Every stored copy, smallest first. */
  copies: PictureCopy[];
  name: string;
  sentence: string | null;
  failure: PictureFailure | null;
}

export interface PrepareNote {
  key: string;
  name: string;
  failure: PictureFailure;
}

export interface EngineState {
  tiles: Tile[];
  notes: PrepareNote[];
  /** Set when the vault refused the listing: the app shows the access-denied screen. */
  refusal: { detail: RefusalDetail | null } | null;
  loaded: boolean;
}
