import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => plugin);

const process = vi.hoisted(() => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => process);

const app = vi.hoisted(() => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => app);

/** What the plugin hands back: a version, a download, and a handle to release. */
const found = (version: string) => ({
  version,
  downloadAndInstall: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
});

/**
 * A fresh copy of the module.
 *
 * It keeps the live update in module state, so a test that shared it with the
 * one before would be testing the leftovers of another launch.
 */
async function freshModule() {
  vi.resetModules();
  return import("./updater");
}

beforeEach(() => {
  vi.clearAllMocks();
  app.getVersion.mockResolvedValue("0.1.0");
});

describe("asking whether there is a newer TimeBuddy", () => {
  it("says no by saying nothing, rather than with a version nobody can install", async () => {
    plugin.check.mockResolvedValue(null);
    const { checkForUpdate } = await freshModule();

    expect(await checkForUpdate()).toBeNull();
  });

  it("narrows the plugin's handle down to a version and a verb", async () => {
    // What a banner can do about an update is offer it and install it. Handing
    // the rest of the app a live download would be handing it a resource to
    // leak somewhere else.
    plugin.check.mockResolvedValue(found("0.2.0"));
    const { checkForUpdate } = await freshModule();

    const update = await checkForUpdate();

    expect(Object.keys(update ?? {}).sort()).toEqual(["install", "version"]);
    expect(update?.version).toBe("0.2.0");
  });

  it("downloads and then restarts, in that order", async () => {
    const update = found("0.2.0");
    plugin.check.mockResolvedValue(update);
    const { checkForUpdate } = await freshModule();

    await (await checkForUpdate())?.install();

    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(process.relaunch).toHaveBeenCalledTimes(1);
    expect(update.downloadAndInstall.mock.invocationCallOrder[0]).toBeLessThan(
      process.relaunch.mock.invocationCallOrder[0],
    );
  });

  it("does not restart when the download failed", async () => {
    // The old build is still the one on disk. Restarting into it would look
    // exactly like an update that worked.
    const update = found("0.2.0");
    update.downloadAndInstall.mockRejectedValue(new Error("disk full"));
    plugin.check.mockResolvedValue(update);
    const { checkForUpdate } = await freshModule();

    await expect((await checkForUpdate())?.install()).rejects.toThrow();
    expect(process.relaunch).not.toHaveBeenCalled();
  });
});

describe("the handle the check leaves behind", () => {
  it("stays open, because installing happens minutes after finding", async () => {
    // Closing it when the check returns would be closing the thing that
    // installs the update.
    const update = found("0.2.0");
    plugin.check.mockResolvedValue(update);
    const { checkForUpdate } = await freshModule();

    await checkForUpdate();

    expect(update.close).not.toHaveBeenCalled();
  });

  it("is released once a later check has replaced it", async () => {
    // Every check allocates one on the Rust side. Pressing the button in
    // Settings a few times would otherwise pile them up for the whole launch.
    const first = found("0.2.0");
    const second = found("0.3.0");
    plugin.check.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { checkForUpdate } = await freshModule();

    await checkForUpdate();
    await checkForUpdate();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).not.toHaveBeenCalled();
  });

  it("is released when a later check finds nothing newer", async () => {
    const first = found("0.2.0");
    plugin.check.mockResolvedValueOnce(first).mockResolvedValueOnce(null);
    const { checkForUpdate } = await freshModule();

    await checkForUpdate();
    await checkForUpdate();

    expect(first.close).toHaveBeenCalledTimes(1);
  });

  it("survives a check that could not be made", async () => {
    // A laptop that lost its network still has an update worth installing from
    // the answer before. Throwing it away would make a failed check destructive.
    const first = found("0.2.0");
    plugin.check
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("no network"));
    const { checkForUpdate } = await freshModule();

    await checkForUpdate();
    await expect(checkForUpdate()).rejects.toThrow();

    expect(first.close).not.toHaveBeenCalled();
  });
});

describe("the version on the screen", () => {
  it("is the running build's own, not a number from a file it could go stale against", async () => {
    const { currentVersion } = await freshModule();

    expect(await currentVersion()).toBe("0.1.0");
  });
});
