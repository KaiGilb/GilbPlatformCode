// The two ends of an Arrow: a small picture of the Subject type at the base (left) and of the Reference type at the
// tip (right). The picture is the type's GilbVeda `a:typePicture` and nothing else: with none, no image is drawn, the caption names
// the end and the 36 px inset stays so the layout does not jump when the picture arrives. A click opens the type's definition (TypeTermPopover). Drawn as HTML over the graph, so the line only needs room at its ends.
import type { EndpointPart } from "@kaigilb/gilbplatformcode-value-card-model";
import { useTypePicture } from "@kaigilb/gilbplatformcode-type-picture";
import { TypeTermPopover } from "@kaigilb/gilbplatformcode-type-term-popover";

/** Room a picture takes at an end of the line (px): the picture (28) plus a gap. */
export const END_ROOM = 36;

/** The caption under a picture: its width, and its box from the picture's centre. Value labels must stay clear of it. */
export const CAPTION_W = 64;
export const CAPTION_H = 12;
export function captionBox(cx: number, cy: number): { left: number; right: number; top: number; bottom: number } {
  return { left: cx - CAPTION_W / 2, right: cx + CAPTION_W / 2, top: cy + 15, bottom: cy + 15 + CAPTION_H };
}
/** Room an end needs from the edge of the graph to the line's end, so a value label there (`labelW` px wide, centred on the end) clears the caption. */
export function endRoom(labelW: number): number {
  return Math.max(END_ROOM, 14 + CAPTION_W / 2 + 4 + labelW / 2);
}

const typeNameOf = (iri: string) => iri.replace(/[/#]+$/, "").split(/[/#]/).pop() ?? "";

/** An end shows a picture only when its part has a type. */
export const endHasType = (part: EndpointPart | undefined): part is EndpointPart => !!part && !!(part.typeIri.trim() || part.typeLabel.trim());

export function EndpointEnd({
  part,
  role,
  cx,
  cy,
  size,
  caption,
}: {
  part: EndpointPart;
  role: "Subject" | "Reference";
  /** Centre of the picture, in px from the top left of the graph. */
  cx: number;
  cy: number;
  /** 28 on the Arrow, 20 on the Timeline. */
  size: 28 | 20;
  caption: boolean;
}) {
  const name = typeNameOf(part.typeIri) || part.typeLabel.trim();
  const label = part.typeLabel.trim() || name;
  const { src, fail } = useTypePicture(name);
  const px = size;
  return (
    <>
      <div data-endpoint-end={role.toLowerCase()} className="absolute" style={{ left: cx - 22, top: cy - 22, width: 44, height: 44 }}>
        <TypeTermPopover
          typeName={name}
          label={label}
          ariaLabel={`${role}: ${label}`}
          triggerTestId={`endpoint-${role.toLowerCase()}`}
          popoverTestId="endpoint-type-popover"
          className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded text-gray-700"
        >
          {src ? (
            <img
              src={src}
              alt=""
              aria-hidden
              decoding="async"
              width={px}
              height={px}
              style={{ width: px, height: px }}
              data-type-picture={name}
              className="object-contain"
              onError={fail}
            />
          ) : null}
        </TypeTermPopover>
      </div>
      {!caption && !src && size === 20 ? (
        // The Timeline axis, no picture: the label (11 px grey) stands where the picture would be, so the end stays named.
        <span
          data-endpoint-caption={role.toLowerCase()}
          aria-hidden
          className="pointer-events-none absolute overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] leading-none text-gray-500"
          style={{ left: 0, top: cy - CAPTION_H / 2, width: 44, height: CAPTION_H }}
        >
          {label}
        </span>
      ) : null}
      {caption ? (
        <span
          data-endpoint-caption={role.toLowerCase()}
          aria-hidden
          className="pointer-events-none absolute overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] leading-none text-gray-500"
          style={{ left: cx - CAPTION_W / 2, top: cy + 15, width: CAPTION_W, height: CAPTION_H }}
        >
          {label}
        </span>
      ) : null}
    </>
  );
}
