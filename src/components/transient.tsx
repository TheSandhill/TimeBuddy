/**
 * The UI that arrives and leaves: the three banners across the top of every
 * screen, and the undo toast at the bottom of the two that raise one.
 *
 * Leaving is what needs a library. An element that animates on the way out has
 * to outlive the condition that raised it, and hand-rolling that state in four
 * places is how four of them end up disagreeing (ADR-0004).
 *
 * A departure is never in the way of the thing it describes: the delete has
 * already been committed and the offer already dismissed by the time the
 * element starts seeing itself out. Nothing waits for it.
 */

import type { ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  type Variants,
} from "motion/react";
import { readDuration, readEasing } from "../theme/motion";

/**
 * Written as functions so the tokens are read when the animation starts rather
 * than when the component rendered — a theme swapped while a banner is up is
 * then the theme the banner leaves on.
 *
 * Arrivals are unhurried and departures are quick, which is the same asymmetry
 * the easings are named for.
 */
const bannerMotion: Variants = {
  gone: () => ({
    height: 0,
    opacity: 0,
    transition: {
      duration: readDuration("--motion-quick"),
      ease: readEasing("--ease-in-quick"),
    },
  }),
  here: () => ({
    height: "auto",
    opacity: 1,
    transition: {
      duration: readDuration("--motion-base"),
      ease: readEasing("--ease-out-soft"),
    },
  }),
};

/**
 * The toast is the one that earns an overshoot: five seconds is not long to be
 * noticed in. The scale is a ratio rather than a length, so it needs no token
 * of its own — a theme that turns the duration down to a millisecond has turned
 * this off with it.
 */
const toastMotion: Variants = {
  gone: () => ({
    opacity: 0,
    scale: 0.96,
    transition: {
      duration: readDuration("--motion-quick"),
      ease: readEasing("--ease-in-quick"),
    },
  }),
  here: () => ({
    opacity: 1,
    scale: 1,
    transition: {
      duration: readDuration("--motion-bounce"),
      ease: readEasing("--ease-bounce-soft"),
    },
  }),
};

/**
 * A departing element stops being the thing it was the moment it starts to go.
 *
 * The condition is already over — the undo window has closed, the update is
 * already installing — so what is left on screen is a picture of a toast rather
 * than a toast. It is out of the accessibility tree and out of reach: undo
 * pressed here is a no-op, and a button that quietly does nothing is worse than
 * one that is plainly gone. Announcing a warning on its way out would be worse
 * still.
 *
 * It is also what keeps the exit invisible to everything that only ever asked
 * whether the toast is there: the answer goes back to "no" at the moment the
 * condition did, not a tenth of a second later.
 */
function Leaving({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const present = useIsPresent();

  return (
    <div className={className} aria-hidden={!present} inert={!present}>
      {children}
    </div>
  );
}

interface TransientProps {
  /** The element while its condition holds, and `null` once it does not. */
  children: ReactNode;
}

/**
 * Everything the two share: presence, the two state names, and the rule that
 * an absent condition renders nothing at all.
 */
function Transient({
  children,
  className,
  reachable,
  variants,
}: TransientProps & {
  className: string;
  /** What the child is dressed in, where it has to be touchable. */
  reachable?: string;
  variants: Variants;
}) {
  return (
    <AnimatePresence>
      {children ? (
        <motion.div
          className={className}
          variants={variants}
          initial="gone"
          animate="here"
          exit="gone"
        >
          <Leaving className={reachable}>{children}</Leaving>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function TransientBanner({ children }: TransientProps) {
  return (
    <Transient className="shrink-0 overflow-hidden" variants={bannerMotion}>
      {children}
    </Transient>
  );
}

/**
 * The toast floats over the screen rather than sitting in it, so the placement
 * belongs here with the arrival: an element that is `fixed` inside something
 * being scaled would be positioned against that instead of against the window.
 *
 * The strip it floats in spans the window, so it is deaf by default — only the
 * bar within it is touchable, and only while it is there to be touched.
 */
export function TransientToast({ children }: TransientProps) {
  return (
    <Transient
      className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center"
      reachable="pointer-events-auto w-fit"
      variants={toastMotion}
    >
      {children}
    </Transient>
  );
}
