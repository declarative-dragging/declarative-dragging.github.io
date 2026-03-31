/**
 * A is the interval [0, aLength], with a special "anchor" at
 * aAnchor. B is the interval [0, aLength], with a special "anchor"
 * at aAnchor. We want to overlap these intervals so that (in
 * descending order of priority): 1. the union starts at 0, 2. the
 * union is as short as possible, 3. the anchors are as close as
 * possible */
export function overlapIntervals({
  aLength,
  aAnchor,
  bLength,
  bAnchor,
}: {
  aLength: number;
  aAnchor: number;
  bLength: number;
  bAnchor: number;
}): { aOffset: number; bOffset: number; length: number } {
  if (aLength >= bLength) {
    const bOffset = Math.max(0, Math.min(aLength - bLength, aAnchor - bAnchor));
    return { aOffset: 0, bOffset, length: aLength };
  } else {
    const aOffset = Math.max(0, Math.min(bLength - aLength, bAnchor - aAnchor));
    return { aOffset, bOffset: 0, length: bLength };
  }
}
