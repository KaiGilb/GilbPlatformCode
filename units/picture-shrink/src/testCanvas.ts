// Test-only: a fake canvas, createImageBitmap, Image and object-URL store for jsdom, which has none of them.
import { vi } from "vitest";

export type Bitmap = { width: number; height: number; close: ReturnType<typeof vi.fn> };
export type BlobCall = { width: number; height: number; type: string | undefined; quality: number | undefined };

export function fakeBitmap(width: number, height: number): Bitmap {
  return { width, height, close: vi.fn() };
}

export type Rig = {
  /** every toBlob call, in order, with the canvas size at that moment */
  blobCalls: BlobCall[];
  /** every drawImage call: [source, 0, 0, w, h] */
  draws: unknown[][];
  createImageBitmap: ReturnType<typeof vi.fn>;
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
  /** make the next Image loads/fails */
  image: { mode: "load" | "error"; width: number; height: number };
  /** getContext answers null when set */
  noContext: boolean;
  /** toBlob answers null when set */
  nullBlob: boolean;
  /** drawImage throws when set */
  drawThrows: boolean;
  restore: () => void;
};

export function installRig(): Rig {
  const rig: Rig = {
    blobCalls: [],
    draws: [],
    createImageBitmap: vi.fn(),
    createObjectURL: vi.fn(() => "blob:example.test/picture"),
    revokeObjectURL: vi.fn(),
    image: { mode: "load", width: 100, height: 100 },
    noContext: false,
    nullBlob: false,
    drawThrows: false,
    restore: () => undefined,
  };
  const g = globalThis as unknown as Record<string, unknown>;
  const savedBitmap = g.createImageBitmap;
  const savedImage = g.Image;
  const savedCreate = URL.createObjectURL;
  const savedRevoke = URL.revokeObjectURL;
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  const savedGetContext = proto.getContext;
  const savedToBlob = proto.toBlob;

  g.createImageBitmap = rig.createImageBitmap;
  URL.createObjectURL = rig.createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = rig.revokeObjectURL as unknown as typeof URL.revokeObjectURL;
  g.Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = rig.image.width;
    naturalHeight = rig.image.height;
    set src(_v: string) {
      queueMicrotask(() => (rig.image.mode === "load" ? this.onload?.() : this.onerror?.()));
    }
  };
  proto.getContext = function (this: HTMLCanvasElement) {
    if (rig.noContext) return null;
    return {
      drawImage: (...args: unknown[]) => {
        if (rig.drawThrows) throw new Error("draw failed");
        rig.draws.push(args);
      },
    };
  };
  proto.toBlob = function (this: HTMLCanvasElement, cb: (b: Blob | null) => void, type?: string, quality?: number) {
    rig.blobCalls.push({ width: this.width, height: this.height, type, quality });
    cb(rig.nullBlob ? null : new Blob(["jpeg"], { type: type ?? "image/png" }));
  };
  rig.restore = () => {
    g.createImageBitmap = savedBitmap;
    g.Image = savedImage;
    URL.createObjectURL = savedCreate;
    URL.revokeObjectURL = savedRevoke;
    proto.getContext = savedGetContext;
    proto.toBlob = savedToBlob;
  };
  return rig;
}
