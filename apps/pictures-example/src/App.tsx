import { useEffect, useSyncExternalStore } from "react";
import { PictureDropZone, PicturePickButtons } from "@kaigilb/gilbplatformcode-picture-pick";
import { PictureFailureNote } from "@kaigilb/gilbplatformcode-picture-errors";
import { AccessDeniedScreen } from "@kaigilb/gilbplatformcode-refusal-detail";
import { SignedImage, forgetPictures, pictureObjectUrl } from "@kaigilb/gilbplatformcode-signed-picture";
import { pickBySize } from "@kaigilb/gilbplatformcode-picture-set";
import { usePictureViewer, type LightboxItem } from "@kaigilb/gilbplatformcode-picture-viewer";
import type { PictureEngine } from "./engine";
import type { Tile } from "./types";
import "@kaigilb/gilbplatformcode-picture-pick/picturePick.css";
import "@kaigilb/gilbplatformcode-picture-viewer/pictureViewer.css";
import "@kaigilb/gilbplatformcode-picture-errors/pictureErrors.css";
import "@kaigilb/gilbplatformcode-refusal-detail/accessDenied.css";
import "./app.css";

const STATUS_WORDS: Record<Tile["status"], string> = {
  saving: "Saving…",
  waiting: "Waiting to retry",
  stuck: "Could not save",
  stored: "",
  wifi: "Full size waits for Wi-Fi",
};

export function App({ engine, onSignOut }: { engine: PictureEngine; onSignOut: () => void }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const origin = engine.session.vaultOrigin;
  const { open, viewer } = usePictureViewer({
    resolveSrc: (item) => pictureObjectUrl(item.fileUri!, origin),
  });

  // Wi-Fi may come back while the app is open, or the page goes online again.
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener("change", engine.poke);
    window.addEventListener("online", engine.poke);
    return () => {
      conn?.removeEventListener("change", engine.poke);
      window.removeEventListener("online", engine.poke);
    };
  }, [engine]);

  if (state.refusal) {
    return (
      <AccessDeniedScreen
        ownerName="the owner of this vault"
        placeName="vault"
        detail={state.refusal.detail ?? undefined}
        onSignOut={onSignOut}
      />
    );
  }

  const openViewer = async (index: number) => {
    const shown = state.tiles.filter((t) => t.copies.length > 0 || t.fileUri);
    const at = shown.findIndex((t) => t.key === state.tiles[index]!.key);
    const items: LightboxItem[] = [];
    for (let i = 0; i < shown.length; i++) {
      const t = shown[i]!;
      const largest = t.copies.length ? pickBySize(t.copies, Infinity) : null;
      let thumbSrc: string | undefined = t.previewUrl ?? undefined;
      if (!thumbSrc && t.fileUri && Math.abs(i - at) <= 1) {
        thumbSrc = await pictureObjectUrl(t.fileUri, origin).catch(() => undefined);
      }
      items.push({
        src: "",
        fileUri: largest?.uri ?? t.fileUri ?? undefined,
        thumbSrc,
        alt: `Picture ${i + 1}`,
        caption: `Picture ${i + 1} of ${shown.length}`,
      });
    }
    open(items, Math.max(0, at));
  };

  return (
    <PictureDropZone onPick={(files) => void engine.add(files)} className="page">
      <header className="top">
        <h1>Pictures</h1>
        <button type="button" className="btn secondary" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <PicturePickButtons onPick={(files) => files.length && void engine.add(files)} multiple />
      {state.notes.map((n) => (
        <div key={n.key} className="note">
          <strong>{n.name}</strong>
          <PictureFailureNote failure={n.failure} />
          <button type="button" className="btn secondary" onClick={() => engine.dismissNote(n.key)}>
            Dismiss
          </button>
        </div>
      ))}
      {!state.loaded ? <p className="hint">Loading…</p> : null}
      {state.loaded && state.tiles.length === 0 ? (
        <p className="hint" data-testid="empty">
          No pictures yet. Take one, choose some, or drop them here.
        </p>
      ) : null}
      <ul className="grid" aria-label="Pictures">
        {state.tiles.map((t, i) => (
          <li key={t.key} className="cell" data-status={t.status}>
            <button type="button" className="tile" data-tile aria-label={`Open picture ${i + 1}`} onClick={() => void openViewer(i)}>
              <SignedImage
                fileUri={t.fileUri}
                vaultOrigin={origin}
                previewUrl={t.previewUrl}
                placeholder={<span className="ph" />}
                alt={`Picture ${i + 1}`}
              />
            </button>
            {STATUS_WORDS[t.status] ? <span className="badge">{STATUS_WORDS[t.status]}</span> : null}
            {t.status === "stuck" ? (
              <>
                {t.failure ? <PictureFailureNote failure={t.failure} /> : null}
                <button type="button" className="btn secondary" onClick={() => engine.tryAgain(t.key)}>
                  Try again
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {viewer}
    </PictureDropZone>
  );
}

/** Sign-out in one place: forget the pictures in memory and on this device. */
export async function forgetEverything(): Promise<void> {
  forgetPictures({ device: true });
}
