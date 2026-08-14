/**
 * WCAG 2.1 contrast, so "is this theme readable" is a number rather than an
 * opinion.
 *
 * Themes are the one part of the app where a bad value looks fine to whoever
 * chose it and is unusable for the next person. This exists to be asserted on
 * in a test — every shipped theme has to pass before it ships.
 */

/** The AA threshold for body text. Large text may go as low as 3. */
export const AA_BODY_TEXT = 4.5;

/** Parses `#rgb` or `#rrggbb` into 0–255 channels. */
export function parseHex(colour: string): [number, number, number] {
  const digits = colour.trim().replace(/^#/, "");

  const pairs =
    digits.length === 3
      ? [...digits].map((digit) => digit + digit)
      : (digits.match(/../g) ?? []);

  if (pairs.length < 3 || !/^[0-9a-fA-F]+$/.test(digits)) {
    throw new Error(`not a hex colour: ${colour}`);
  }

  const [red, green, blue] = pairs
    .slice(0, 3)
    .map((pair) => parseInt(pair, 16));
  return [red, green, blue];
}

/** Relative luminance, per the WCAG definition. */
export function luminance(colour: string): number {
  const [red, green, blue] = parseHex(colour).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contrast between two colours: 1 for identical, 21 for black on white. */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );

  return (lighter + 0.05) / (darker + 0.05);
}
