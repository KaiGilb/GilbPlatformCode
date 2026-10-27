import { createContext, useContext, useEffect, useState } from "react";
import type { TypePictureSource } from "./pictureSource";

/**
 * The host-made source of type pictures (`createTypePictureSource`), provided once above the app.
 * With no provider there is no source, and no type has a picture: nothing is drawn.
 */
export const TypePictureSourceContext = createContext<TypePictureSource | null>(null);

/** Catalog raster for a BaseVeda type name (`Chair`), or null while loading / absent. */
export function useTypePictureSrc(typeName: string | null | undefined): string | null {
  const source = useContext(TypePictureSourceContext);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!typeName || !source) {
      setSrc(null);
      return;
    }
    setSrc(null);
    let live = true;
    void source.fetchTypePictureSrc(typeName).then((next) => {
      if (live) setSrc(next);
    });
    return () => {
      live = false;
    };
  }, [typeName, source]);
  return src;
}
