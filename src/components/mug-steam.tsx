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

/** Whether the layer is rising or faded out. `AppMark` decides which. */
export type SteamState = "on" | "off";

/**
 * MugSteam: five plumes drifting up through a fixed noise field.
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
export function MugSteam({ state }: { state: SteamState }) {
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
