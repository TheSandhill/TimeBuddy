/**
 * A state change wrapped in the platform's own cross-fade, for the prototype
 * behind #68.
 *
 * The tokens are *not* read here, which is the point of the shape: a view
 * transition animates `::view-transition-old|new`, which are ordinary
 * pseudo-elements in the cascade, so `var(--motion-base)` reaches them the way
 * it reaches anything else. This is the one motion consumer that needs no
 * runtime read at all — unlike the motion library, which cannot see CSS
 * (`src/theme/motion.ts`).
 *
 * Everything below the fold here is what the prototype found out; ADR-0015 is
 * the decision it led to.
 */

import { flushSync } from "react-dom";

/**
 * The update has to land **synchronously**, inside the callback: the browser
 * captures the old frame before calling it and the new one the moment it
 * returns. React batches state updates by default, so a bare `setOpen(false)`
 * here would return with the DOM unchanged and the browser would cross-fade a
 * frame to itself.
 *
 * So the flush belongs in here rather than at each call site. It is a real
 * cost, named where it is paid: this opts the render out of React's scheduling
 * for exactly as long as the update takes.
 */
export function withViewTransition(update: () => void): void {
  if (!("startViewTransition" in document)) {
    // jsdom, and any host that is not evergreen Chromium. The change still
    // lands; it simply does not take its time about it — the same failure mode
    // `readDuration` chooses when no stylesheet answers.
    update();
    return;
  }

  const transition = document.startViewTransition(() => {
    flushSync(update);
  });

  // The browser skips the animation whenever it cannot honour one — a second
  // transition starting, a duplicate `view-transition-name`, a backgrounded
  // window — and rejects `ready` to say so. The change has already been made by
  // then, so there is nothing to recover and nothing to report.
  transition.ready.catch(() => {});
}
