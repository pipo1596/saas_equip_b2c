// A tenant logo can be any aspect ratio, but its display box has a fixed
// width — left alone, a squarer logo would just render tiny within a box
// shaped for a wide banner logo. Instead, only the box's width stays fixed;
// its height grows (up to a cap) to whatever the logo's own aspect ratio
// would need to fill that width, so a less-wide logo renders bigger.
export function computeAdaptiveLogoHeight(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  minHeight: number,
  maxHeight: number,
): number {
  const ratio = naturalWidth / naturalHeight;
  const heightAtFullWidth = boxWidth / ratio;
  return Math.min(maxHeight, Math.max(minHeight, heightAtFullWidth));
}
