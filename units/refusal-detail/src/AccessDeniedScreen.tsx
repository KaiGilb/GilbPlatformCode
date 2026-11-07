import type { RefusalDetail } from "./refusal";
import { refusalLine } from "./refusal";

/** Shown when the vault refuses the person's read: no codes, no server sentence. The request details sit in a collapsed block. */
export function AccessDeniedScreen({ onSignOut, detail = null, ownerName, placeName = "vault", backgroundImage, backgroundColor }: { onSignOut: () => void; detail?: RefusalDetail | null; ownerName: string; placeName?: string; backgroundImage?: string; backgroundColor?: string }) {
  return (
    <>
      {backgroundImage || backgroundColor ? <div className="bg-layer" style={{ backgroundColor, backgroundImage: backgroundImage ? `url("${backgroundImage}")` : undefined }} aria-hidden="true" /> : null}
      <main className="signin-screen">
        <div className="signin-panel">
          <h1 className="display">{`This ${placeName} is private`}</h1>
          <p className="tagline">Ask its owner, {ownerName}, to add you.</p>
          <details className="refusal-details">
            <summary>Details</summary>
            <p>{detail ? refusalLine(detail) : "No request details were kept for this refusal."}</p>
          </details>
          <button type="button" className="btn secondary full" onClick={onSignOut}>Sign out</button>
        </div>
      </main>
    </>
  );
}
