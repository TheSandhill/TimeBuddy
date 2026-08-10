import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTimerToggle,
  requestTimerToggle,
  useTimerToggle,
} from "./toggle-request";

/** Clicking the menu item, from outside React's render pass. */
const clickMenuItem = () => act(() => requestTimerToggle());

afterEach(() => {
  clearTimerToggle();
});

describe("a start/stop asked for from the tray", () => {
  it("waits for the screen that can answer it", () => {
    // The tray menu is reachable from every screen; the Timer is where the
    // answer lives. The request is made first and mounted into second.
    const toggle = vi.fn();
    clickMenuItem();

    renderHook(() => useTimerToggle(toggle));

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("is acted on once, not on every render after it", () => {
    const toggle = vi.fn();
    const { rerender } = renderHook(() => useTimerToggle(toggle));

    clickMenuItem();
    rerender();
    rerender();

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("does not carry over to the next screen that mounts", () => {
    // Two Timer screens never exist at once, but a remount must not replay a
    // stop that already happened — that would log a block twice.
    const first = vi.fn();
    const second = vi.fn();
    const { unmount } = renderHook(() => useTimerToggle(first));
    clickMenuItem();
    unmount();

    renderHook(() => useTimerToggle(second));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("acts again the next time the menu item is clicked", () => {
    const toggle = vi.fn();
    renderHook(() => useTimerToggle(toggle));

    clickMenuItem();
    clickMenuItem();

    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("runs the handler the screen has now, not the one it mounted with", () => {
    // The handler closes over the block that is running; the countdown
    // rebuilds it every second. Acting on a stale one would stop a block that
    // has since ended.
    const stale = vi.fn();
    const current = vi.fn();
    const { rerender } = renderHook(
      ({ toggle }) => useTimerToggle(toggle),
      { initialProps: { toggle: stale } },
    );

    rerender({ toggle: current });
    clickMenuItem();

    expect(stale).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });

  it("drops a request nobody was there to hear", () => {
    const toggle = vi.fn();
    clickMenuItem();
    clearTimerToggle();

    renderHook(() => useTimerToggle(toggle));

    expect(toggle).not.toHaveBeenCalled();
  });
});
