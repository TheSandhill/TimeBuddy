import mugUrl from "../assets/mug.png";

/**
 * The asset's own aspect, so a caller gives a width and never a pair.
 *
 * One of two numbers measured off `mug.png`. The other is its optical offset,
 * which lives in the `app-mark` utility in `styles.css` because it is a nudge in
 * the same family as `glyph-label`'s. **Replace the asset and both need redoing**
 * — that split is the cost, and ADR-0016 records it.
 */
const MARK_ASPECT = 225 / 256;

interface AppMarkProps {
  /**
   * Drawn width in px. A **perceptual value, tuned by eye** — the rules the
   * mark answers ("quiet beneath the digits", "fits the titlebar's cell") are
   * comparisons rather than formulas, so each caller names its own number and
   * nothing here derives one.
   */
  width: number;
  /** Held. Dims the mark — see the note below on why it is a level. */
  dimmed?: boolean;
}

/**
 * The Mug: the app's face, and the same mug as the app icon (ADR-0016).
 *
 * A **raster**, not a drawing on tokens. Three attempts at hand-authoring it as
 * SVG were rejected and the diagnosis was the method, not the drawing — so the
 * mark is the icon's own file rather than a fourth attempt.
 *
 * One component for both slots — the dial's centre and the titlebar's left cell
 * — for the reason ADR-0004 gives for the control vocabulary: the copies
 * disagree. The mark's size is the only thing a caller decides.
 *
 * **Decorative everywhere.** The countdown and the word *paused* already say
 * anything it could, so a label here would have a screen reader read the
 * countdown twice.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not brighten, slide or steam.** Dimming when held is a *level,
 *   not a movement*: reduced motion and High-contrast both set every loop to
 *   `none`, and held is the one state that reads as a broken app if it goes
 *   unsaid (ADR-0004). A raster cannot drain, so the level is its own opacity.
 * - **It does not centre itself on its own box.** The handle makes that read
 *   off-axis; `app-mark` shifts the mark onto the cup's measured centre, and the
 *   number lives in the stylesheet with the measurement that produced it.
 * - **It does not know which theme it is in.** High-contrast drops the mark in
 *   the stylesheet, because that theme's contract is that nothing is soft and a
 *   shaded photograph cannot flatten to an outline. A theme is answered by the
 *   cascade, never by a branch in a component.
 */
export function AppMark({ width, dimmed = false }: AppMarkProps) {
  return (
    <img
      src={mugUrl}
      alt=""
      aria-hidden="true"
      width={width}
      height={Math.round(width * MARK_ASPECT)}
      data-app-mark
      className={`app-mark transition-opacity motion-quick ease-out-soft ${
        dimmed ? "opacity-40" : "opacity-100"
      }`}
    />
  );
}
