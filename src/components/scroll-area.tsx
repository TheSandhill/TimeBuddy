import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  scrollTopFromDrag,
  thumbGeometry,
  type Grab,
  type ThumbGeometry,
} from "./scroll-geometry";

/**
 * How long after the last scroll the thumb stays up before fading out.
 *
 * A dwell rather than a duration: nothing is moving while it runs, and a theme
 * turning motion down has no opinion about how long a readout should remain
 * legible — turning *this* down would take the readout away sooner, which is
 * the opposite of what reduced motion asks for. So it is a number here, in the
 * way `UNDO_WINDOW_MS` is, rather than a `--motion-*` tier (ADR-0004).
 */
const SETTLE_MS = 900;

interface ScrollAreaProps {
  children: ReactNode;
  /** Classes for the scrolling body itself: its padding, its view transition. */
  className?: string;
}

/**
 * The app's scrolling body, with a scrollbar that costs no width (#71).
 *
 * WebView2's classic scrollbar sits in a gutter of its own, so a list growing
 * past the viewport pushes the content sideways — a layout that moves because
 * of how much data is in it. `scrollbar-gutter: stable` stops the jog by
 * spending that width on every screen instead, and styling
 * `::-webkit-scrollbar` opts the element out of overlay behaviour entirely, so
 * it fixes the colour and keeps the gutter. Neither is affordable in a window
 * this narrow, so the native bar is hidden and the thumb is drawn here.
 *
 * The thumb **overlaps** the content rather than the body reserving room for
 * it: every consumer already carries `p-6`, so a 6px thumb 4px in from the edge
 * floats over padding and never over a row's trailing text. That keeps the
 * promise of zero cost literally — the body is exactly as wide scrolling as
 * still.
 *
 * Quiet by default: transparent at rest, visible while scrolling and while the
 * pointer is over the body, faded out again once scrolling settles. The fade is
 * the pleasure, not the message — under reduced motion and in High-contrast the
 * tier collapses to a millisecond and the thumb simply appears, which is still
 * a correct readout of the scroll position (ADR-0004).
 *
 * One component, three consumers, and the next screen that scrolls gets it for
 * free — the same reason the control vocabulary lives in two files.
 */
export function ScrollArea({ children, className = "" }: ScrollAreaProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<ThumbGeometry | null>(null);

  const [scrolling, setScrolling] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grabbed = useRef<Grab | null>(null);

  const metrics = () => {
    const body = viewport.current;
    return body === null
      ? null
      : {
          scrollTop: body.scrollTop,
          scrollHeight: body.scrollHeight,
          clientHeight: body.clientHeight,
        };
  };

  const measure = useCallback(() => {
    const now = metrics();
    setThumb(now === null ? null : thumbGeometry(now));
  }, []);

  useEffect(() => {
    const body = viewport.current;
    if (body === null) {
      return;
    }

    /*
     * Two things move the thumb without anyone scrolling. The window resizing
     * changes the viewport's own box; content growing changes `scrollHeight`
     * while leaving that box alone, which only the children report — so both
     * are watched, and re-watched whenever a row arrives or leaves.
     */
    const sizes = new ResizeObserver(measure);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(body);
      for (const child of body.children) {
        sizes.observe(child);
      }
      measure();
    };

    const rows = new MutationObserver(watch);
    rows.observe(body, { childList: true, subtree: true, characterData: true });
    watch();

    return () => {
      sizes.disconnect();
      rows.disconnect();
    };
  }, [measure]);

  useEffect(
    () => () => {
      if (settle.current !== null) {
        clearTimeout(settle.current);
      }
    },
    [],
  );

  const onScroll = () => {
    measure();
    setScrolling(true);
    if (settle.current !== null) {
      clearTimeout(settle.current);
    }
    settle.current = setTimeout(() => setScrolling(false), SETTLE_MS);
  };

  const onGrab = (event: ReactPointerEvent<HTMLDivElement>) => {
    const now = metrics();
    if (now === null || thumb === null) {
      return;
    }

    grabbed.current = {
      pointerY: event.clientY,
      scrollTop: now.scrollTop,
      height: thumb.height,
    };
    setDragging(true);
    // So the drag survives the pointer leaving a bar six pixels wide.
    event.currentTarget.setPointerCapture(event.pointerId);
    // Otherwise the press selects the text the thumb is floating over.
    event.preventDefault();
  };

  const onDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const body = viewport.current;
    const start = grabbed.current;
    const now = metrics();
    if (body === null || start === null || now === null) {
      return;
    }

    body.scrollTop = scrollTopFromDrag(now, start, event.clientY);
  };

  const onRelease = () => {
    grabbed.current = null;
    setDragging(false);
  };

  const visible = scrolling || hovered || dragging;

  return (
    <main
      className="relative flex min-h-0 flex-1 flex-col"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        ref={viewport}
        onScroll={onScroll}
        className={`min-h-0 flex-1 overflow-y-auto scrollbar-none ${className}`}
      >
        {children}
      </div>

      {thumb === null ? null : (
        <div
          data-testid="scroll-thumb"
          aria-hidden="true"
          style={{ top: thumb.top, height: thumb.height }}
          onPointerDown={onGrab}
          onPointerMove={onDrag}
          onPointerUp={onRelease}
          onPointerCancel={onRelease}
          className={`absolute right-1 w-1.5 cursor-grab rounded-full bg-accent transition-opacity motion-base active:cursor-grabbing ${
            visible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
      )}
    </main>
  );
}
