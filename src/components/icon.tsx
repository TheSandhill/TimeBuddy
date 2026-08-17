/**
 * The icon set.
 *
 * Phosphor, bold weight, and the weight is the reason: at a 256 grid its stroke
 * is 24 units, which is 2.25px once an icon is drawn at 24px — within a hair of
 * the 1.25-in-a-12-box the hand-drawn glyphs used, so the set slots in at the
 * weight the app already had. Rounded terminals and open counters are the same
 * thing Nunito was chosen for, so the glyphs and the type read as one voice.
 *
 * The paths are **fills, not strokes**: bold Phosphor ships pre-outlined, which
 * is why there is no `strokeWidth` here and why a glyph scales without its line
 * thickening. `currentColor` still does the work it always did — a button's own
 * hover carries its glyph, and no icon names a colour of its own, so ADR-0004's
 * rule against raw hexes holds without an exception for artwork.
 *
 * Names are what a glyph *means* here, not what it depicts: `clients` rather
 * than `user-list`. A screen asking for `clients` keeps asking the right
 * question when the artwork is swapped underneath it.
 */
const paths = {
  timer:
    "M128 44a96 96 0 1 0 96 96a96.11 96.11 0 0 0-96-96m0 168a72 72 0 1 1 72-72a72.08 72.08 0 0 1-72 72m36.49-112.49a12 12 0 0 1 0 17l-28 28a12 12 0 0 1-17-17l28-28a12 12 0 0 1 17 0M92 16a12 12 0 0 1 12-12h48a12 12 0 0 1 0 24h-48a12 12 0 0 1-12-12",
  entries:
    "M228 128a12 12 0 0 1-12 12H116a12 12 0 0 1 0-24h100a12 12 0 0 1 12 12M116 76h100a12 12 0 0 0 0-24H116a12 12 0 0 0 0 24m100 104H116a12 12 0 0 0 0 24h100a12 12 0 0 0 0-24M44 59.31V104a12 12 0 0 0 24 0V40a12 12 0 0 0-17.36-10.73l-16 8a12 12 0 0 0 9.36 22Zm39.73 96.86a27.7 27.7 0 0 0-11.2-18.63A28.89 28.89 0 0 0 32.9 143a27.7 27.7 0 0 0-4.17 7.54a12 12 0 0 0 22.55 8.21a4 4 0 0 1 .58-1a4.78 4.78 0 0 1 6.5-.82a3.82 3.82 0 0 1 1.61 2.6a3.63 3.63 0 0 1-.77 2.77l-.13.17l-28.68 38.35A12 12 0 0 0 40 220h32a12 12 0 0 0 0-24h-8l14.28-19.11a27.48 27.48 0 0 0 5.45-20.72",
  clients:
    "M152 80a12 12 0 0 1 12-12h80a12 12 0 0 1 0 24h-80a12 12 0 0 1-12-12m92 36h-80a12 12 0 0 0 0 24h80a12 12 0 0 0 0-24m0 48h-56a12 12 0 0 0 0 24h56a12 12 0 0 0 0-24m-88.38 25a12 12 0 1 1-23.24 6c-5.72-22.23-28.24-39-52.38-39s-46.66 16.76-52.38 39a12 12 0 1 1-23.24-6c5.38-20.9 20.09-38.16 39.11-48a52 52 0 1 1 73 0c19.04 9.85 33.75 27.11 39.13 48M80 132a28 28 0 1 0-28-28a28 28 0 0 0 28 28",
  reports:
    "M224 196h-4V40a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v36H96a12 12 0 0 0-12 12v36H48a12 12 0 0 0-12 12v60h-4a12 12 0 0 0 0 24h192a12 12 0 0 0 0-24M164 52h32v144h-32Zm-56 48h32v96h-32Zm-48 48h24v48H60Z",
  settings:
    "M128 76a52 52 0 1 0 52 52a52.06 52.06 0 0 0-52-52m0 80a28 28 0 1 1 28-28a28 28 0 0 1-28 28m92-27.21v-1.58l14-17.51a12 12 0 0 0 2.23-10.59A111.8 111.8 0 0 0 225 71.89a12 12 0 0 0-9.11-5.89l-22.28-2.5l-1.11-1.11L190 40.1a12 12 0 0 0-5.89-9.1a111.7 111.7 0 0 0-27.23-11.27A12 12 0 0 0 146.3 22l-17.51 14h-1.58L109.7 22a12 12 0 0 0-10.59-2.23a111.8 111.8 0 0 0-27.22 11.28A12 12 0 0 0 66 40.11l-2.5 22.28l-1.11 1.11L40.1 66a12 12 0 0 0-9.1 5.89a111.7 111.7 0 0 0-11.23 27.23A12 12 0 0 0 22 109.7l14 17.51v1.58L22 146.3a12 12 0 0 0-2.23 10.59a111.8 111.8 0 0 0 11.29 27.22a12 12 0 0 0 9.05 5.89l22.28 2.48l1.11 1.11L66 215.9a12 12 0 0 0 5.89 9.1a111.7 111.7 0 0 0 27.23 11.27A12 12 0 0 0 109.7 234l17.51-14h1.58l17.51 14a12 12 0 0 0 10.59 2.23A111.8 111.8 0 0 0 184.11 225a12 12 0 0 0 5.91-9.06l2.48-22.28l1.11-1.11L215.9 190a12 12 0 0 0 9.06-5.91a111.7 111.7 0 0 0 11.27-27.23A12 12 0 0 0 234 146.3Zm-24.12-4.89a70 70 0 0 1 0 8.2a12 12 0 0 0 2.61 8.22l12.84 16.05a86.5 86.5 0 0 1-4.33 10.49l-20.43 2.27a12 12 0 0 0-7.65 4a69 69 0 0 1-5.8 5.8a12 12 0 0 0-4 7.65L166.86 207a86.5 86.5 0 0 1-10.49 4.35l-16.05-12.85a12 12 0 0 0-7.5-2.62h-.72a70 70 0 0 1-8.2 0a12.06 12.06 0 0 0-8.22 2.6l-16.05 12.85A86.5 86.5 0 0 1 89.14 207l-2.27-20.43a12 12 0 0 0-4-7.65a69 69 0 0 1-5.8-5.8a12 12 0 0 0-7.65-4L49 166.86a86.5 86.5 0 0 1-4.35-10.49l12.84-16.05a12 12 0 0 0 2.61-8.22a70 70 0 0 1 0-8.2a12 12 0 0 0-2.61-8.22L44.67 99.63A86.5 86.5 0 0 1 49 89.14l20.43-2.27a12 12 0 0 0 7.65-4a69 69 0 0 1 5.8-5.8a12 12 0 0 0 4-7.65L89.14 49a86.5 86.5 0 0 1 10.49-4.35l16.05 12.85a12.06 12.06 0 0 0 8.22 2.6a70 70 0 0 1 8.2 0a12 12 0 0 0 8.22-2.6l16.05-12.85A86.5 86.5 0 0 1 166.86 49l2.27 20.43a12 12 0 0 0 4 7.65a69 69 0 0 1 5.8 5.8a12 12 0 0 0 7.65 4L207 89.14a86.5 86.5 0 0 1 4.35 10.49l-12.84 16.05a12 12 0 0 0-2.63 8.22",
} as const;

export type IconName = keyof typeof paths;

export const ICON_NAMES = Object.keys(paths) as IconName[];

/**
 * `aria-hidden` without exception: every control that carries a glyph already
 * has its own name, and a glyph that announced itself would give the control
 * two. There is deliberately no way to pass a label in — an icon that has to
 * speak is a control missing an `aria-label`, and that is the bug to fix.
 *
 * The size is a class rather than a prop so a glyph sizes the way everything
 * else on the screen does. `size-4` is the tab bar's, and the common case.
 */
export function Icon({
  name,
  className = "size-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <path d={paths[name]} />
    </svg>
  );
}
