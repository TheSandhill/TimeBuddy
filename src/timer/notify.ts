/**
 * A Windows notification, for the two things TimeBuddy has to say to someone
 * who is not looking at it.
 *
 * At the end of a Pomodoro Block, the chime is the other half of the same
 * announcement, and this is the half that works when TimeBuddy is behind
 * another window — which is where a timer you are not supposed to watch
 * normally is. For a window that has just hidden itself in the tray, there is
 * no other half: it is that or silence, and silence reads as a crash.
 *
 * Every failure here is swallowed. A notification that did not appear is worth
 * nothing more than its own absence: the block has still ended, the hours are
 * still logged, and an error banner about a missed toast would be louder than
 * the toast.
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export async function notify(title: string, body: string): Promise<void> {
  try {
    // Asked on first use rather than at launch: the permission prompt makes
    // sense next to the thing it is for.
    const granted =
      (await isPermissionGranted()) ||
      (await requestPermission()) === "granted";

    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // No notification plugin — a browser, a test, a webview that said no.
  }
}
