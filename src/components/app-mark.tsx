import mugUrl from "../assets/mug.png";

/**
 * The asset's own aspect, so a caller gives a width and never a pair.
 *
 * One of the numbers measured off `mug.png`. The others are its optical offset
 * and its steam's anchor, both in `styles.css`, and its two tones in
 * `contrast.test.ts`. **Replace the asset and all of them need redoing** — that
 * split is the cost of a raster mark, and ADR-0016 records it.
 */
const MARK_ASPECT = 225 / 256;

/**
 * The steam's two filter knobs, and the reason they are here rather than in
 * `styles.css` with the other eleven: SVG filter primitives take **attributes**,
 * and an attribute cannot read a custom property.
 *
 * `WISP` is the one that decides whether this reads as vapour or as three
 * blurred lozenges — it is how far the noise field shoves each pixel sideways.
 * Too low and the plumes stay smooth ovals; too high and they shred into
 * unconnected specks, which is the "particles" failure from the other direction.
 *
 * `SOFTEN` is the blur after the displacement. It has to come *after*, or the
 * turbulence is smoothed away before it does any work.
 */
const WISP = 8;
const SOFTEN = 1.3;

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
  steam?: "on" | "off";
}

/**
 * Steam: five plumes drifting up through a fixed noise field.
 *
 * The shapes are soft radial ellipses — deliberately dull on their own. What
 * makes them read as vapour is that the `feDisplacementMap` is *stationary* while
 * the plumes travel through it, so each one is a different shape at every height
 * and the group never repeats. See the long note on `.mug-steam` in
 * `styles.css`, which owns every value except the two above.
 *
 * **Five, not three.** Three left countable gaps in the column, and anything you
 * can count reads as particles rather than as vapour. Each needs a matching
 * `:nth-child` rule in the stylesheet for its delay and drift; a plume without
 * one inherits the base timing and pulses in step with the first, which is
 * exactly the look this is avoiding.
 *
 * Static turbulence specifically: animating it would mean SMIL, and **SMIL does
 * not read CSS** (ADR-0014), so a themed `--animate-steam: none` and
 * `prefers-reduced-motion` would both be ignored by it.
 *
 * Always mounted where there is steam at all, and turned on by attribute rather
 * than by mounting: the fade needs something to fade from, and a layer that
 * arrived on Start would snap. The prototype recorded that mistake in its other
 * form — a disclosure panel rebuilt already-open has no `0fr` to spring from.
 *
 * The gradient and the filter carry instance-free ids because only the dial ever
 * renders this — the titlebar passes no `steam`, so there is never a second copy
 * in the document to collide with.
 */
function Steam({ state }: { state: "on" | "off" }) {
  return (
    <svg
      className="mug-steam"
      data-steaming={state}
      viewBox="0 0 64 80"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="mug-steam-plume" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>

        {/*
         * Generous bounds: the plumes rise and spread well outside the box the
         * ellipses start in, and a filter region clips what it does not cover.
         */}
        <filter
          id="mug-steam-wisp"
          x="-70%"
          y="-40%"
          width="240%"
          height="200%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.028 0.062"
            numOctaves={3}
            seed={9}
            result="field"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="field"
            scale={WISP}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feGaussianBlur stdDeviation={SOFTEN} />
        </filter>
      </defs>

      {/*
       * The filter is on the group, not on each plume — that is what makes the
       * noise field shared and stationary. Per-plume filters would give five
       * shapes each distorted the same way at every height, which is the
       * particle look again with extra cost.
       */}
      <g filter="url(#mug-steam-wisp)" fill="url(#mug-steam-plume)">
        <ellipse className="mug-steam__plume" cx="26" cy="68" rx="9" ry="12" />
        <ellipse className="mug-steam__plume" cx="34" cy="70" rx="11" ry="10" />
        <ellipse className="mug-steam__plume" cx="30" cy="66" rx="8" ry="13" />
        <ellipse className="mug-steam__plume" cx="38" cy="69" rx="9" ry="11" />
        <ellipse className="mug-steam__plume" cx="22" cy="70" rx="8" ry="10" />
      </g>
    </svg>
  );
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
      } ${dimmed ? "opacity-40" : "opacity-100"}`}
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
