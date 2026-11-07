import { useEffect, useRef, useState, type ReactNode } from "react";
import { pictureObjectUrl } from "./pictureUrl";
import { queuePicture } from "./pictureQueue";

/** A square thumbnail that fetches its picture only when it nears the screen. `previewUrl` (a local picture) wins. */
export function SignedImage({
  fileUri,
  vaultOrigin,
  previewUrl,
  placeholder = null,
  className = "thumb",
  alt = "",
}: {
  fileUri: string | null;
  vaultOrigin: string;
  previewUrl?: string | null;
  placeholder?: ReactNode;
  className?: string;
  alt?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    // Already on (or just below) the screen: no need to wait for the observer's first callback.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight + 200 && r.bottom > -200) {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || !fileUri || previewUrl) return;
    let live = true;
    queuePicture(() => pictureObjectUrl(fileUri, vaultOrigin)).then(
      (u) => live && setSrc(u),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [near, fileUri, vaultOrigin, previewUrl]);

  const shown = previewUrl ?? src;
  return (
    <div className={className} ref={ref} data-state={shown ? "shown" : failed ? "failed" : "loading"}>
      {shown ? (
        <img src={shown} alt={alt} />
      ) : (
        <>
          {placeholder}
          {failed ? <span className="signed-image-failed">This picture could not be loaded.</span> : null}
        </>
      )}
    </div>
  );
}
