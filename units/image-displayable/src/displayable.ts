// CAN THIS BROWSER ACTUALLY PAINT THESE BYTES?
//
// A crop surface or a preview paints the picked file into an `<img>`. If the browser cannot
// decode the file, the person is shown an empty box and asked to drag a rectangle on nothing.
//
// ── WHY THIS IS A PROBE AND NOT A MEDIA-TYPE LIST ──
// 🔴 A list would encode TODAY'S browsers as a permanent fact, and the fact is already moving:
// iOS Safari decodes HEIC natively while desktop Chrome did not (measured 2026-09-18 — Chrome
// failed in BOTH `<img>` and `createImageBitmap`, with a known-good PNG and known-bad garbage
// as controls). A hardcoded "HEIC is undisplayable" would make every iPhone user pay for a
// round trip they do not need, and would be wrong again the day Chrome ships HEVC.
// ⇒ Ask the browser in front of you. It is the only authority on what it can draw, and the
//   answer costs one decode attempt on bytes already in memory.
//
// ⚠ This is the CLIENT-side sibling of a server's "can I transcode this media type?" check. They
// answer different questions on purpose — that one asks "can this server open it?", this one asks
// "can this browser draw it?" — and ⛔ neither is a substitute for the other.

/**
 * True when this browser can decode `blob` well enough to paint it in an `<img>`.
 *
 * ⚠ Answers about the RUNNING browser, not about the format. The same file returns true on iOS
 * Safari and false on desktop Chrome, and that difference is the point.
 *
 * @param blob the picked file, or any image bytes
 * @returns whether the crop surface will have something to show
 */
export async function browserCanDisplay(blob: Blob): Promise<boolean> {
  // `createImageBitmap` is the sharper instrument where it exists: it forces a real PIXEL
  // decode, whereas an `<img>` that has not been laid out can resolve on header alone in some
  // engines. Measured on desktop Chrome, both agree for HEIC — but they are not guaranteed to, and
  // the stricter answer is the safe one here: a false negative costs a round trip, a false
  // positive costs the person an empty crop box.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      // Release the decoded surface immediately — on a 26 MP camera original this is ~100 MB of
      // RGBA, and we only ever wanted the yes/no.
      if (typeof bitmap.close === "function") bitmap.close();
      return true;
    } catch {
      return false;
    }
  }

  // Fallback for engines without createImageBitmap. `decode()` is awaited rather than trusting
  // `onload`, for the header-vs-pixels reason above.
  return new Promise<boolean>((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const done = (answer: boolean) => {
      URL.revokeObjectURL(url);
      resolve(answer);
    };
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(() => done(true), () => done(false));
        return;
      }
      done(img.naturalWidth > 0);
    };
    img.onerror = () => done(false);
    img.src = url;
  });
}
