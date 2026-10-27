// A GilbVeda type's picture and nothing else. The picture is the type's `a:typePicture` (useTypePictureSrc).
// A type with no picture, or a picture that fails to load, draws NOTHING: no stand-in glyph, no empty space.
import { useEffect, useState } from "react";
import { useTypePictureSrc } from "./useTypePictureSrc";
import { normalizeTypeName } from "@kaigilb/gilbplatformcode-type-name";

/** The picture address of a type, or null while loading / absent / broken. `fail` is for the <img> onError. */
export function useTypePicture(typeName: string | null | undefined): { src: string | null; fail: () => void } {
  const name = normalizeTypeName(typeName);
  const fetched = useTypePictureSrc(name);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [name]);
  const src = fetched && failed !== fetched ? fetched : null;
  return { src, fail: () => setFailed(fetched) };
}

/** The picture at `px` (square), or nothing. */
export function TypePicture({ typeName, px, className = "" }: { typeName: string | null | undefined; px: number; className?: string }) {
  const { src, fail } = useTypePicture(typeName);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      decoding="async"
      width={px}
      height={px}
      data-type-picture={normalizeTypeName(typeName) ?? ""}
      style={{ width: px, height: px }}
      className={`inline-block shrink-0 object-contain align-middle ${className}`}
      onError={fail}
    />
  );
}
