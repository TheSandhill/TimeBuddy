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
import { check } from "@tauri-apps/plugin-updater";

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
