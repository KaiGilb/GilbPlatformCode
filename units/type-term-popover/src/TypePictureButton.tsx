import { useTypePicture } from "@kaigilb/gilbplatformcode-type-picture";
import { TypeTermPopover } from "./TypeTermPopover";

/**
 * The picture as a 20 px button (44 px hit area) that opens the type's definition popover. With no picture it renders nothing at all.
 * `ariaLabel` is e.g. "Subject type: mobile app".
 */
export function TypePictureButton({
  typeName,
  label,
  ariaLabel,
  px = 20,
  triggerTestId,
  popoverTestId,
  onOpenOntology,
}: {
  typeName: string;
  label: string;
  ariaLabel: string;
  px?: number;
  triggerTestId?: string;
  popoverTestId?: string;
  onOpenOntology?: (name: string) => void;
}) {
  const { src, fail } = useTypePicture(typeName);
  if (!src) return null;
  return (
    <TypeTermPopover
      typeName={typeName}
      label={label}
      ariaLabel={ariaLabel}
      triggerTestId={triggerTestId}
      popoverTestId={popoverTestId}
      onOpenOntology={onOpenOntology}
      className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-center align-middle"
    >
      <img
        src={src}
        alt=""
        aria-hidden
        decoding="async"
        width={px}
        height={px}
        data-type-picture={typeName}
        style={{ width: px, height: px }}
        className="shrink-0 object-contain"
        onError={fail}
      />
    </TypeTermPopover>
  );
}
