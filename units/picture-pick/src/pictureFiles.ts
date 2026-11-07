const PICTURE_EXTENSIONS = [".heic", ".heif", ".avif", ".webp", ".jpg", ".jpeg", ".png", ".gif"];

/**
 * The picture files in a list, in order. A file is a picture when its type starts with `image/`, or
 * when its type is empty and its name ends in a picture extension (browsers often give a HEIC file an
 * empty type).
 */
export function pictureFiles(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => {
    if (f.type.startsWith("image/")) return true;
    if (f.type !== "") return false;
    const name = f.name.toLowerCase();
    return PICTURE_EXTENSIONS.some((ext) => name.endsWith(ext));
  });
}
