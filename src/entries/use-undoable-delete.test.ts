import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimeEntry } from "../data/types";
import { UNDO_WINDOW_MS, useUndoableDelete } from "./use-undoable-delete";

function entry(id: number): TimeEntry {
  return {
    id,
    projectId: 1,
    date: "2026-08-05",
    durationMinutes: 60,
    startAt: null,
    endAt: null,
    note: null,
    source: "manual",
    createdAt: "2026-08-05T09:00:00Z",
    updatedAt: "2026-08-05T09:00:00Z",
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("deleting an entry behind an undo window", () => {
  it("writes nothing until the window has run out", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useUndoableDelete(commit));

    act(() => result.current.request(entry(1)));

    expect(commit).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual(entry(1));

    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS));

    expect(commit).toHaveBeenCalledWith(entry(1));
    expect(result.current.pending).toBeNull();
  });

  it("never deletes the row at all when undone in time", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useUndoableDelete(commit));

    act(() => result.current.request(entry(1)));
    act(() => result.current.undo());

    expect(result.current.pending).toBeNull();

    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS * 2));

    expect(commit).not.toHaveBeenCalled();
  });

  it("settles the first deletion before starting a second", () => {
    // One toast at a time: a second undo button would offer back a row the
    // first one is already about to take away.
    const commit = vi.fn();
    const { result } = renderHook(() => useUndoableDelete(commit));

    act(() => result.current.request(entry(1)));
    act(() => result.current.request(entry(2)));

    expect(commit).toHaveBeenCalledExactlyOnceWith(entry(1));
    expect(result.current.pending).toEqual(entry(2));

    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS));

    expect(commit).toHaveBeenLastCalledWith(entry(2));
  });

  it("does not quietly undo itself when the screen goes away", () => {
    const commit = vi.fn();
    const { result, unmount } = renderHook(() => useUndoableDelete(commit));

    act(() => result.current.request(entry(1)));
    unmount();

    expect(commit).toHaveBeenCalledWith(entry(1));
  });
});
