import { describe, expect, it } from "vitest";
import {
  MIN_THUMB_HEIGHT,
  scrollTopFromDrag,
  thumbGeometry,
} from "./scroll-geometry";

/** A viewport 200 tall over 800 of content: a quarter is on screen. */
const quarter = { scrollTop: 0, scrollHeight: 800, clientHeight: 200 };

describe("where the thumb sits", () => {
  it("draws nothing when the content fits", () => {
    expect(
      thumbGeometry({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 }),
    ).toBeNull();
    expect(
      thumbGeometry({ scrollTop: 0, scrollHeight: 120, clientHeight: 200 }),
    ).toBeNull();
  });

  it("draws nothing before the container has been measured", () => {
    expect(
      thumbGeometry({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }),
    ).toBeNull();
  });

  it("is as tall a share of the track as the viewport is of the content", () => {
    expect(thumbGeometry(quarter)?.height).toBe(50);
  });

  it("sits at the top at rest and at the bottom at the end", () => {
    expect(thumbGeometry(quarter)?.top).toBe(0);
    expect(thumbGeometry({ ...quarter, scrollTop: 600 })?.top).toBe(150);
  });

  it("travels in proportion to the scroll between the two", () => {
    expect(thumbGeometry({ ...quarter, scrollTop: 300 })?.top).toBe(75);
  });

  it("stays grabbable over a very long list", () => {
    const long = { scrollTop: 0, scrollHeight: 100_000, clientHeight: 200 };
    expect(thumbGeometry(long)?.height).toBe(MIN_THUMB_HEIGHT);

    // And the shortened thumb still reaches the bottom of the track.
    expect(thumbGeometry({ ...long, scrollTop: 99_800 })?.top).toBe(
      200 - MIN_THUMB_HEIGHT,
    );
  });

  it("clamps a scrollTop past either end, as rubber-banding hands us", () => {
    expect(thumbGeometry({ ...quarter, scrollTop: -40 })?.top).toBe(0);
    expect(thumbGeometry({ ...quarter, scrollTop: 900 })?.top).toBe(150);
  });
});

describe("dragging the thumb", () => {
  /** A thumb 50 tall taken hold of at y=100, with the content at `from`. */
  const dragged = (from: number, by: number) =>
    scrollTopFromDrag(
      quarter,
      { pointerY: 100, scrollTop: from, height: 50 },
      100 + by,
    );

  it("scrolls nowhere when the pointer has not moved", () => {
    expect(dragged(0, 0)).toBe(0);
  });

  it("scrolls the content by the track's share of the drag", () => {
    // 150 of track carries 600 of content: four times the pointer's travel.
    expect(dragged(0, 25)).toBe(100);
    expect(dragged(200, -25)).toBe(100);
  });

  it("stops at both ends however far the pointer goes", () => {
    expect(dragged(0, -500)).toBe(0);
    expect(dragged(0, 500)).toBe(600);
  });

  it("does not move content that cannot scroll", () => {
    const still = { scrollTop: 0, scrollHeight: 200, clientHeight: 200 };
    expect(
      scrollTopFromDrag(still, { pointerY: 0, scrollTop: 0, height: 200 }, 40),
    ).toBe(0);
  });
});
