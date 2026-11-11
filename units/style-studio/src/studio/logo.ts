// Logo handling. SVG is never stored: it is sanitized, rasterized to PNG, and only the PNG data URL is kept.
import DOMPurify from "dompurify";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_SIDE = 512;
// The sheet validator refuses data URLs over 200000 characters; stay below it.
const MAX_DATA_URL_CHARS = 190000;

export function sanitizeSvg(svg: string): string {
  const out = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "iframe"],
    FORBID_ATTR: ["onload", "onerror", "onclick"],
  });
  return String(out);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The image could not be read."));
    img.src = src;
  });
}

function drawToDataUrl(img: HTMLImageElement, type: "image/png" | "image/jpeg"): string {
  const w0 = img.naturalWidth || img.width || MAX_LOGO_SIDE;
  const h0 = img.naturalHeight || img.height || MAX_LOGO_SIDE;
  const k = Math.min(1, MAX_LOGO_SIDE / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * k));
  canvas.height = Math.max(1, Math.round(h0 * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the image.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, 0.85);
}

export async function svgToPngDataUrl(svgText: string): Promise<string> {
  let clean = sanitizeSvg(svgText).trim();
  if (!/<svg[\s>]/i.test(clean)) throw new Error("That file has no usable SVG content.");
  if (!/<svg[^>]*\sxmlns=/i.test(clean)) clean = clean.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const url = URL.createObjectURL(new Blob([clean], { type: "image/svg+xml" }));
  try {
    return drawToDataUrl(await loadImage(url), "image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readAs(file: Blob, how: "text" | "dataUrl"): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("The file could not be read."));
    if (how === "text") r.readAsText(file);
    else r.readAsDataURL(file);
  });
}

export const readFileText = (file: Blob): Promise<string> => readAs(file, "text");

export type LogoResult = { ok: true; dataUrl: string } | { ok: false; error: string };

export async function processLogoFile(file: File): Promise<LogoResult> {
  if (file.size > MAX_LOGO_BYTES) return { ok: false, error: "That file is larger than 2 MB. Choose a smaller logo." };
  const name = file.name.toLowerCase();
  const type = file.type || (name.endsWith(".svg") ? "image/svg+xml" : "");
  try {
    if (type === "image/svg+xml") {
      return { ok: true, dataUrl: await svgToPngDataUrl(await readAs(file, "text")) };
    }
    if (type === "image/png" || type === "image/jpeg" || type === "image/webp") {
      let url = await readAs(file, "dataUrl");
      if (url.length > MAX_DATA_URL_CHARS) {
        url = drawToDataUrl(await loadImage(url), type === "image/jpeg" ? "image/jpeg" : "image/png");
      }
      if (url.length > MAX_DATA_URL_CHARS) return { ok: false, error: "That image is too detailed to store. Try a simpler or smaller one." };
      return { ok: true, dataUrl: url };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The logo could not be read." };
  }
  return { ok: false, error: "Use a PNG, JPEG, WebP or SVG file." };
}

/** A png/jpeg/webp base64 data URL to a Blob (no network). Returns undefined for anything else. */
export function dataUrlToBlob(url: string | undefined): Blob | undefined {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url ?? "");
  if (!m) return undefined;
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}
