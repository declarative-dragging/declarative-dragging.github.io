// The Dragology repo's arrowhead (src/arrows.tsx), which the library doesn't
// export: the perm lab's cycle diagram draws its arrows' heads with it.

import { path, rotateRad, translate, Vec2, type Vec2able } from "dragology";
import { SVGProps } from "react";

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
