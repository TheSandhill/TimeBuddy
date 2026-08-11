import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupStatus } from "../data/types";

const commands = vi.hoisted(() => ({
  backupStatus: vi.fn(),
  runBackup: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const { useDailyBackup } = await import("./use-daily-backup");

const safe: BackupStatus = {
  folder: "D:\\OneDrive\\TimeBuddy",
  lastBackupAt: "2026-08-05T09:00:00Z",
  kept: 7,
  due: false,
  stale: false,
};

const owed: BackupStatus = { ...safe, due: true };

const refused = { kind: "backup", message: "D:\\ is not there" };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const mounted = () => renderHook(() => useDailyBackup(), { wrapper });

beforeEach(() => {
  vi.clearAllMocks();
  commands.backupStatus.mockResolvedValue(safe);
  commands.runBackup.mockResolvedValue(safe);
});

describe("the daily backup", () => {
  it("makes one when today's has not been made", async () => {
    commands.backupStatus.mockResolvedValue(owed);

    mounted();

    await waitFor(() => expect(commands.runBackup).toHaveBeenCalledTimes(1));
  });

  it("does not make one when today's is already there", async () => {
    const { result } = mounted();

    await waitFor(() => expect(commands.backupStatus).toHaveBeenCalled());
    expect(commands.runBackup).not.toHaveBeenCalled();
    expect(result.current.failure).toBeNull();
  });

  it("tries once per launch, not once per render", async () => {
    // A folder on an unplugged drive fails every time it is asked. Retrying in
    // a loop would be a spinning disk and a banner that never settles.
    commands.backupStatus.mockResolvedValue(owed);
    commands.runBackup.mockRejectedValue(refused);

    const { result, rerender } = mounted();

    await waitFor(() => expect(result.current.failure).not.toBeNull());
    rerender();
    rerender();
    expect(commands.runBackup).toHaveBeenCalledTimes(1);
  });

  it("says so out loud when the backup fails, rather than failing silently", async () => {
    commands.backupStatus.mockResolvedValue(owed);
    commands.runBackup.mockRejectedValue(refused);

    const { result } = mounted();

    // The time of the newest backup that *did* work travels with the failure:
    // "it broke" and "and this is what you still have" are one message.
    await waitFor(() =>
      expect(result.current.failure).toEqual({
        lastBackupAt: "2026-08-05T09:00:00Z",
      }),
    );
  });

  it("admits when a failure leaves nothing at all behind", async () => {
    commands.backupStatus.mockResolvedValue({
      ...owed,
      lastBackupAt: null,
      kept: 0,
      stale: true,
    });
    commands.runBackup.mockRejectedValue(refused);

    const { result } = mounted();

    await waitFor(() =>
      expect(result.current.failure).toEqual({ lastBackupAt: null }),
    );
  });

  it("says nothing when the backup it owed was made", async () => {
    commands.backupStatus.mockResolvedValue({
      ...owed,
      lastBackupAt: null,
      kept: 0,
      stale: true,
    });
    commands.runBackup.mockResolvedValue(safe);

    const { result } = mounted();

    await waitFor(() => expect(commands.runBackup).toHaveBeenCalled());
    // A folder with nothing in it is not news while a first backup is being
    // made — which, on a fresh install, is on the way in before the banner
    // could be read.
    await waitFor(() => expect(result.current.failure).toBeNull());
  });

  it("takes the warning down when a retry works", async () => {
    // The drive was plugged back in. A retry that succeeded while the first
    // failure was still on record would leave a banner nobody can dismiss.
    commands.backupStatus.mockResolvedValue(owed);
    commands.runBackup.mockRejectedValueOnce(refused);

    const { result } = mounted();
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(commands.runBackup).toHaveBeenCalledTimes(2);
  });

  it("says nothing before the folder has been read", () => {
    // Not knowing yet is not news. A banner on every launch, retracted a moment
    // later, would be the boy who cried wolf by the second week.
    const { result } = mounted();

    expect(result.current.failure).toBeNull();
    expect(commands.runBackup).not.toHaveBeenCalled();
  });
});
