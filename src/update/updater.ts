/**
 * The one place the app talks to the updater.
 *
 * `@tauri-apps/plugin-updater` is imported here and nowhere else, for the same
 * reason `invoke` is called in one place (ADR-0002): what comes back from
 * `check()` is a live object with a download in it, and the rest of the app has
 * no business holding one.
 *
 * What it is narrowed to is a version and a verb. That is the whole of what a
 * banner or a settings screen can do about an update, and it makes both of them
 * testable against a plain object instead of against GitHub.
 */

import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export interface PendingUpdate {
  /** The version on GitHub — already known to be newer than this build. */
  version: string;
  /**
   * Downloads it, runs the installer, and restarts into the new build.
   *
   * Resolving is not something a caller gets to act on: by then the process is
   * on its way out. Only rejecting is news.
   */
  install: () => Promise<void>;
}

/** The version of the build that is running. Not read from `package.json`. */
export function currentVersion(): Promise<string> {
  return getVersion();
}

/**
 * The handle the last check left behind, held so that the next one can close it.
 *
 * `check()` allocates a resource on the Rust side and answers with a handle to
 * it. The handle cannot be released when the check returns — it is the thing
 * that installs the update, possibly minutes later, from a bar the user has not
 * looked at yet. So it is released when it is **superseded**: one live update at
 * a time, the newest answer, rather than one per press of the button in Settings
 * for the rest of the launch.
 */
let live: Update | null = null;

/**
 * Asks the endpoint in `tauri.conf.json` whether there is a newer TimeBuddy,
 * and answers `null` when this is already it.
 *
 * The comparison and the signature check both happen inside the plugin: an
 * update whose signature does not match the public key baked into this build is
 * refused there, which is what keeps one public URL from being a way to install
 * anything at all (ADR-0009).
 */
export async function checkForUpdate(): Promise<PendingUpdate | null> {
  const update = await check();

  // Only once the new answer is actually in: a check that could not be made
  // leaves the previous update installable, so a lost network is not a reason to
  // throw away something the user could still have acted on.
  const superseded = live;
  live = update;
  if (superseded !== null) await superseded.close();

  if (update === null) return null;

  return {
    version: update.version,
    install: async () => {
      await update.downloadAndInstall();
      // The installer has replaced the exe; this is the only exit the app asks
      // for on its own behalf. It exits the process rather than closing the
      // window, which matters because closing the window hides it (ADR-0004).
      await relaunch();
    },
  };
}
