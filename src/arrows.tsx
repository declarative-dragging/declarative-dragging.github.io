import { SVGProps } from "react";
import { Vec2, Vec2able } from "./math/vec2";
import { path, rotateRad, translate } from "./svgx/helpers";

/**
 * Creates a triangular arrowhead polygon.
 *
 * Mandatory props:
 * - tip: Position of the arrowhead tip
 * - direction: Direction vector the arrow points (will be normalized)
 *
 * Optional props with defaults:
 * - headAngle: Angle between the two sides of the arrowhead (default: Math.PI / 8)
 * - headLength: Length from tip to base of arrowhead (default: 20)
 *
 * Any other SVG polygon props are passed through.
 */
export function arrowhead({
  tip,
  direction,
  headAngleRad = Math.PI / 4,
  headLength = 20,
  ...polygonProps
}: Omit<SVGProps<SVGPolygonElement>, "points" | "transform" | "direction"> & {
  /** Position of the arrowhead tip */
  tip: Vec2able;
  /** Direction vector the arrow points (will be normalized) */
  direction: Vec2able;
  /** Angle between the two sides of the arrowhead (default: Math.PI / 8) */
  headAngleRad?: number;
  /** Length from tip to base of arrowhead (default: 20) */
  headLength?: number;
}) {
  const tipVec = Vec2(tip);
  const dirVec = Vec2(direction);

  // Define arrowhead pointing right (at 0 degrees) with tip at origin
  const halfWidth = headLength * Math.tan(headAngleRad / 2);

  return (
    <polygon
      transform={translate(tipVec) + rotateRad(dirVec.angleRad())}
      points={path([0, 0], [-headLength, halfWidth], [-headLength, -halfWidth])}
      {...polygonProps}
    />
  );
}
