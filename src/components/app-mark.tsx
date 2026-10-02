import mugUrl from "../assets/mug.png";
import { Steam, type SteamState } from "./mug-steam";

/**
 * The asset's own aspect, so a caller gives a width and never a pair.
 *
 * One of the numbers measured off `mug.png`. The others are its optical offset
 * and its steam's anchor, both in `styles.css`, and its two tones in
 * `contrast.test.ts`. **Replace the asset and all of them need redoing** — that
 * split is the cost of a raster mark, and ADR-0016 records it.
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
  /**
   * Held. Greys the mark out — dimmed *and* desaturated, so the coffee's warmth
   * goes with the brightness. See the note below on why it is a level.
   */
  dimmed?: boolean;
  /**
   * Whether this slot has steam, and whether it is currently rising.
   *
   * Three states rather than two, and the distinction matters: **omitted** means
   * no steam layer at all, which is what the titlebar passes — `CONTEXT.md` →
   * Motion says nothing is on the titlebar, because the bar is on every screen
   * and an animation there would sit in the corner of the eye permanently.
   *
   * `"off"` means the layer is there and faded out. A caller that has steam at
   * all should pass `"off"` rather than dropping the prop, because the fade
   * needs something mounted to fade *from* — see the note on the toggle rule in
   * `styles.css`.
   */
  steam?: SteamState;
}

/**
 * The Mug: the app's face, and the same mug as the app icon (ADR-0016).
 *
 * A **raster body with drawn steam** — the body is the icon's own file, because
 * three attempts at hand-authoring the mug as SVG were rejected and the
 * diagnosis was the method rather than the drawing. The steam is drawn, which is
 * the one part of the mark that has to be: a photograph cannot rise.
 *
 * One component for both slots — the dial's centre and the titlebar's left cell
 * — for the reason ADR-0004 gives for the control vocabulary: the copies
 * disagree. A caller decides the size, and whether it steams.
 *
 * **Decorative everywhere.** The countdown and the word *paused* already say
 * anything it could, so a label here would have a screen reader read the
 * countdown twice.
 *
 * Three things it deliberately does not do:
 *
 * - **It does not say anything with the steam.** *Running* is the moving digits
 *   and the breathing ring; the steam is the pleasure (ADR-0004's rule that no
 *   state is signalled by motion alone). Which is what lets reduced motion
 *   remove it outright rather than freeze it — there is no still form of steam
 *   worth having.
 * - **It does not snap the steam on and off.** Start and Stop are the one place
 *   the app is allowed to be slow enough to notice, so the layer fades on
 *   `deliberate` — the tier written for the mug pouring out on a manual stop,
 *   finally spent on the nearest thing the mark can actually do.
 * - **It does not centre itself on its own box.** The handle makes that read
 *   off-axis; `app-mark` shifts the mark onto the cup's measured centre, and the
 *   number lives in the stylesheet with the measurement that produced it.
 * - **It does not know which theme it is in.** High-contrast drops the mark in
 *   the stylesheet, because that theme's contract is that nothing is soft and a
 *   shaded photograph cannot flatten to an outline. A theme is answered by the
 *   cascade, never by a branch in a component.
 */
export function AppMark({ width, dimmed = false, steam }: AppMarkProps) {
  const mug = (
    <img
      src={mugUrl}
      alt=""
      aria-hidden="true"
      width={width}
      height={Math.round(width * MARK_ASPECT)}
      data-app-mark
      className={`transition-opacity motion-quick ease-out-soft ${
        steam === undefined ? "app-mark" : ""
      } ${dimmed ? "opacity-40 grayscale" : "opacity-100"}`}
    />
  );

  if (steam === undefined) {
    return mug;
  }

  /*
   * Wrapped only when it steams, so the titlebar's mark stays a bare `<img>`.
   *
   * The optical offset moves to the **wrapper** here rather than staying on the
   * image. It has to: the steam is positioned against its container, so if only
   * the mug shifted, the plumes would rise 6px to the right of the mouth they
   * are supposed to come out of. Offsetting both together keeps `--steam-x` the
   * honest measured centre of the mouth, and keeps that offset tunable in one
   * place without the steam drifting off the cup.
   */
  return (
    <span className="app-mark relative inline-flex" data-mark-slot>
      {mug}
      <Steam state={steam} />
    </span>
  );
}
