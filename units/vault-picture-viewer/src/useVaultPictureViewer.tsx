import "@kaigilb/gilbplatformcode-picture-viewer/pictureViewer.css";
import { usePictureViewer, type LightboxItem, type LightboxWords } from "@kaigilb/gilbplatformcode-picture-viewer";
import { largestUriOf, thumbUriOf, type CopyMap } from "@kaigilb/gilbplatformcode-picture-set";
import { pictureObjectUrl } from "@kaigilb/gilbplatformcode-signed-picture";
import { useCallback, type ReactNode } from "react";

export interface VaultPictureViewerOptions {
  /** The vault's origin: the signed `GET <vaultOrigin>/files/<id>` goes there (`pictureObjectUrl` needs it). */
  vaultOrigin: string;
  /** The vault's copy map (`loadCopyMap` of picture-set); null while the files are not listed yet. */
  copies: CopyMap | null;
  /** Your words over the viewer's English ones. */
  words?: Partial<LightboxWords>;
}

export interface VaultPictureViewer {
  /** Render this once in your component; it is null while the viewer is closed. */
  viewer: ReactNode;
  /** Opens a stored picture: its thumbnail at once as a stand-in, then its largest stored copy. Never throws for a thumbnail that cannot be read. */
  openStored(i: { master: string; alt: string; caption?: string; el?: HTMLElement | null }): Promise<void>;
  /** Opens a picture the person has on this device (a local URL): no signing and no fetch. */
  openLocal(i: { url: string; alt: string; caption?: string }): void;
  /** The thumbnail's address for a master: null while `copies` is null, else its smallest copy (the master itself when it has none). */
  thumbUri(master: string): string | null;
}

/** Opens vault pictures in the full-screen viewer, signing every read. Importing this module also loads the viewer's stylesheet. */
export function useVaultPictureViewer(o: VaultPictureViewerOptions): VaultPictureViewer {
  const { vaultOrigin, copies, words } = o;
  // A stored item has a `fileUri` and is fetched signed; a local one has none and its `src` is the URL itself.
  const resolveSrc = useCallback(
    (item: LightboxItem) => (item.fileUri ? pictureObjectUrl(item.fileUri, vaultOrigin) : Promise.resolve(item.src)),
    [vaultOrigin],
  );
  const { open, viewer } = usePictureViewer({ words, resolveSrc });

  const openStored = useCallback(
    async (i: { master: string; alt: string; caption?: string; el?: HTMLElement | null }): Promise<void> => {
      let thumbSrc: string | undefined;
      try {
        thumbSrc = await pictureObjectUrl(thumbUriOf(copies, i.master) ?? i.master, vaultOrigin);
      } catch {
        thumbSrc = undefined; // no stand-in: the viewer opens and shows its own loading cue
      }
      const fileUri = largestUriOf(copies, i.master);
      open([{ src: fileUri, alt: i.alt, caption: i.caption ?? i.alt, el: i.el, thumbSrc, fileUri }]);
    },
    [copies, vaultOrigin, open],
  );
  const openLocal = useCallback(
    (i: { url: string; alt: string; caption?: string }): void => {
      open([{ src: i.url, alt: i.alt, caption: i.caption ?? i.alt }]);
    },
    [open],
  );
  const thumbUri = useCallback((master: string): string | null => thumbUriOf(copies, master), [copies]);

  return { viewer, openStored, openLocal, thumbUri };
}
