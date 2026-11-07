import { pictureFiles } from "./pictureFiles";

export type PicturePickWords = Partial<{ takePhoto: string; choosePhoto: string; choosePhotos: string }>;

const DEFAULT_WORDS = { takePhoto: "Take photo", choosePhoto: "Choose photo", choosePhotos: "Choose photos" };

export type PicturePickButtonsProps = {
  /** Called with the picture files the person took or chose. */
  onPick: (files: File[]) => void;
  words?: PicturePickWords;
  multiple?: boolean;
  disabled?: boolean;
};

export function PicturePickButtons({ onPick, words, multiple = false, disabled = false }: PicturePickButtonsProps) {
  const w = { ...DEFAULT_WORDS, ...words };
  return (
        <div className="row">
          <label className="btn secondary grow" aria-disabled={disabled || undefined}>
            {w.takePhoto}
            <input type="file" accept="image/*" capture="environment" hidden disabled={disabled} onChange={(e) => { onPick(pictureFiles(e.target.files)); e.target.value = ""; }} />
          </label>
          <label className="btn secondary grow" aria-disabled={disabled || undefined}>
            {multiple ? w.choosePhotos : w.choosePhoto}
            <input type="file" accept="image/*" multiple={multiple} hidden disabled={disabled} onChange={(e) => { onPick(pictureFiles(e.target.files)); e.target.value = ""; }} />
          </label>
        </div>
  );
}
