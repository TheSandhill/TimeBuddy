import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const commands = vi.hoisted(() => ({
  accountExists: vi.fn(),
  resumeSession: vi.fn(),
  restoreOutcome: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const { useSession } = await import("./use-session");
const { readToken, writeToken } = await import("./session");

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  commands.accountExists.mockResolvedValue(true);
  commands.resumeSession.mockResolvedValue(false);
  // The overwhelmingly common launch: no restore was staged.
  commands.restoreOutcome.mockResolvedValue({ status: "nothing" });
});

describe("which door the app opens with", () => {
  it("asks before it shows anything", () => {
    const { result } = renderHook(() => useSession());

    expect(result.current.state).toBe("checking");
  });

  it("raises the wizard when this install has never been set up", async () => {
    commands.accountExists.mockResolvedValue(false);
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.state).toBe("setup"));
    expect(commands.resumeSession).not.toHaveBeenCalled();
  });

  it("locks when there is an account and nothing remembered", async () => {
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.state).toBe("locked"));
    expect(commands.resumeSession).not.toHaveBeenCalled();
  });

  it("opens straight up on a token Rust still accepts", async () => {
    writeToken("remembered");
    commands.resumeSession.mockResolvedValue(true);
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.state).toBe("open"));
    expect(commands.resumeSession).toHaveBeenCalledWith("remembered");
  });

  it("locks — and throws the token away — once Rust refuses it", async () => {
    // Expiry is decided where the deadline is stored, not here.
    writeToken("stale");
    commands.resumeSession.mockResolvedValue(false);
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.state).toBe("locked"));
    expect(readToken()).toBeNull();
  });

  it("locks rather than opens when the database cannot be reached", async () => {
    // The safe direction: it must not open by accident.
    commands.accountExists.mockRejectedValue(new Error("no database"));
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.state).toBe("locked"));
  });
});

describe("a launch that restored a backup", () => {
  it("re-locks, because the password came back with the database", async () => {
    // The account row travels with the file (ADR-0008), so the password is now
    // the one from the day that backup was made. Staying open would leave the
    // app unlocked by a key it no longer accepts.
    writeToken("issued by the database that just left");
    commands.resumeSession.mockResolvedValue(true);
    commands.restoreOutcome.mockResolvedValue({
      status: "done",
      restoredFrom: "2026-08-01T09:00:00Z",
      safetyCopy: "timebuddy-20260809T120000Z.db",
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.state).toBe("locked"));
    expect(readToken()).toBeNull();
    expect(
      commands.resumeSession,
      "a token from a database that is gone is not worth asking about",
    ).not.toHaveBeenCalled();
  });

  it("raises the wizard when the restored database has no account", async () => {
    // A backup from before setup finished is still a backup. It restores to
    // what it was, which is an install that has to be set up.
    commands.accountExists.mockResolvedValue(false);
    commands.restoreOutcome.mockResolvedValue({
      status: "done",
      restoredFrom: "2026-08-01T09:00:00Z",
      safetyCopy: "timebuddy-20260809T120000Z.db",
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.state).toBe("setup"));
  });

  it("leaves a remembered session alone when the restore failed", async () => {
    // Nothing was replaced, so the database — and the password — are the ones
    // this webview's token was issued by.
    writeToken("still good");
    commands.resumeSession.mockResolvedValue(true);
    commands.restoreOutcome.mockResolvedValue({
      status: "failed",
      fault: "safetyCopyFailed",
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.state).toBe("open"));
    expect(readToken()).toBe("still good");
  });
});

describe("going through the door", () => {
  it("keeps a token that was asked for", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toBe("locked"));

    act(() => result.current.open("fresh"));

    expect(result.current.state).toBe("open");
    expect(readToken()).toBe("fresh");
  });

  it("forgets one that was not", async () => {
    // Unticking the box is an instruction, not the absence of one.
    writeToken("from before");
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toBe("locked"));

    act(() => result.current.open(null));

    expect(result.current.state).toBe("open");
    expect(readToken()).toBeNull();
  });
});
