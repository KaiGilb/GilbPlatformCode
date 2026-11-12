/** The two copies of one picture, ready to store, and an object URL of the screen copy for a local preview (the owner revokes it). */
export interface PreparedPicture {
  thumb: Blob;
  screen: Blob;
  previewUrl: string;
}

/**
 * What storing a picture answers. The same shape as picture-set's `StoredPicture` (which satisfies it), declared here so the "." entry
 * needs no picture-set. Only `master`, `thumb` and `warning` are read.
 */
export interface UploadedPicture {
  /** The master's address: the one thing a record keeps. */
  master: string;
  /** The small copy's address, or null when it was not stored. */
  thumb: string | null;
  /** A sentence when the picture is stored but its small copy is not linked, else null. */
  warning: string | null;
}
