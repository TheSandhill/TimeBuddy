/**
 * Where the floating scrollbar's thumb goes, as arithmetic.
 *
 * Split out from the component it dresses because this is the whole of what the
 * scrollbar knows: a ratio and a clamp (#71). Reading it here means the thumb's
 * position, its minimum height and the drag mapping can be checked without a
 * DOM that reports every measurement as zero, which is what jsdom does.
 */

/** What a scrolling element reports about itself. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** The thumb, in pixels down from the top of the viewport it floats over. */
export interface ThumbGeometry {
  top: number;
  height: number;
}

/** Where a drag began, on both the axes it maps between. */
export interface Grab {
  /** The pointer, in client coordinates. */
  pointerY: number;
  /** What the content was scrolled to when the thumb was taken hold of. */
  scrollTop: number;
  /**
   * The thumb on screen at that moment, minimum height included — so the drag
   * maps against the bar the hand is actually holding.
   */
  height: number;
}

/**
 * The shortest the thumb is allowed to get. A list long enough drives the
 * honest height towards nothing, and a bar that reports the scroll position but
 * cannot be grabbed is a decoration.
 */
export const MIN_THUMB_HEIGHT = 28;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * The thumb for a set of scroll metrics, or `null` when there is nothing to
 * scroll — including before the container has been measured, where every
 * number is zero and a full-height thumb would otherwise flash on mount.
 *
 * `scrollTop` is clamped rather than trusted: an overscroll hands us a negative
 * one, and the thumb should sit at the end rather than leave the track.
 */
export function thumbGeometry({
  scrollTop,
  scrollHeight,
  clientHeight,
}: ScrollMetrics): ThumbGeometry | null {
  const scrollable = scrollHeight - clientHeight;
  if (clientHeight <= 0 || scrollable <= 0) {
    return null;
  }

  const height = clamp(
    (clientHeight / scrollHeight) * clientHeight,
    Math.min(MIN_THUMB_HEIGHT, clientHeight),
    clientHeight,
  );
  const travel = clientHeight - height;

  return { top: clamp(scrollTop / scrollable, 0, 1) * travel, height };
}

/**
 * Where a drag that began at `grab` and has reached `pointerY` leaves the
 * content.
 *
 * The inverse of the ratio above: the thumb crosses the track while the content
 * crosses everything it has, so a pixel of pointer is worth as many pixels of
 * content as the one distance is of the other.
 */
export function scrollTopFromDrag(
  { scrollHeight, clientHeight }: ScrollMetrics,
  grab: Grab,
  pointerY: number,
): number {
  const scrollable = scrollHeight - clientHeight;
  const travel = clientHeight - grab.height;
  if (scrollable <= 0 || travel <= 0) {
    return clamp(grab.scrollTop, 0, Math.max(scrollable, 0));
  }

  const moved = ((pointerY - grab.pointerY) * scrollable) / travel;
  return clamp(grab.scrollTop + moved, 0, scrollable);
}
