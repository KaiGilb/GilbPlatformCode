// Pane-toggle icons for the shell header / bottom bar.
// Left rail frame; right = the same mark mirrored.
// Rail thickness encodes open state: thick when pane is open, thin when closed.
// Stroke/fill use currentColor so theme + active colours apply.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  /** When true, the inner rail is thick (pane open). When false, thin (pane closed). */
  open?: boolean;
};

/** Open (current) thickness — matches the approved thick rail. */
const RAIL_OPEN_W = 5;
/** Closed thickness — thin line inside the same frame. */
const RAIL_CLOSED_W = 1.5;
const RAIL_X = 4.35;
const RAIL_Y = 5.15;
const RAIL_H = 13.7;
const RAIL_RX = 0.75;

function svgProps({ size = 28, className, open: _open, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
    className,
    ...rest,
  };
}

/** Shared geometry: rounded frame + solid vertical rail on the LEFT. */
function PanelRailIcon({ open = true, ...props }: IconProps) {
  const railW = open ? RAIL_OPEN_W : RAIL_CLOSED_W;
  return (
    <svg {...svgProps({ open, ...props })}>
      <rect
        x="2.5"
        y="3.25"
        width="19"
        height="17.5"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <rect
        x={RAIL_X}
        y={RAIL_Y}
        width={railW}
        height={RAIL_H}
        rx={open ? 1.5 : RAIL_RX}
        fill="currentColor"
      />
    </svg>
  );
}

/** Open/close selection (left) panel. */
export function PanelLeftIcon(props: IconProps) {
  return <PanelRailIcon {...props} />;
}

/** Open/close detail (right) panel — same icon, mirrored. */
export function PanelRightIcon(props: IconProps) {
  const { className, style, ...rest } = props;
  return (
    <PanelRailIcon
      {...rest}
      className={className}
      style={{ ...style, transform: "scaleX(-1)" }}
    />
  );
}
