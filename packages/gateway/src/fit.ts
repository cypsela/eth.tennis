/**
 * Font-size (px) so that `maxCols` monospace chars fit `viewportWidth`, capped at
 * `capPx`. `charRatio` is the advance width of a monospace glyph in em (~0.6).
 */
export function fitFontSize(
  viewportWidth: number,
  maxCols: number,
  capPx = 14,
  charRatio = 0.6,
): number {
  const fit = viewportWidth / (maxCols * charRatio);
  return Math.max(1, Math.min(capPx, fit));
}
