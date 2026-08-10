/**
 * Keeps the tray icon saying what is true, and hears it when it is clicked.
 *
 * The tray's words are the app's words: they come from the catalogues and are
 * handed to Rust, so the menu changes language along with everything else and
 * the tooltip counts a running block down.
 *
 * It counts in whole minutes, not in the `MM:SS` the titlebar pill shows. A
 * tooltip nobody is hovering is not worth a message across the IPC boundary
 * every second, and a minute is as precise as a hover needs to be.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { syncTray } from "../data/commands";
import type { TrayLabels } from "../data/types";
import { remainingSeconds } from "../timer/block";
import { SECONDS_PER_MINUTE } from "../timer/clock";
import type { RunningBlock } from "../timer/use-running-block";
import { explainHiddenToTray } from "./hidden-notice";

/**
 * The tray's Start/Stop item, on its way to the Timer screen. Rust emits both
 * of these, and asserts the strings against this file from its own tests — so
 * a rename on one side alone fails the suite rather than the menu.
 */
export const TOGGLE_TIMER_EVENT = "tray://toggle-timer";

/** The window has just gone into the tray, by whichever route. */
export const HIDDEN_TO_TRAY_EVENT = "tray://hidden";

/**
 * The event bus, imported once and shared.
 *
 * Lazily, so a test — or a browser — can render this without a Tauri runtime
 * underneath it. Once, because two subscribers importing it at the same
 * instant is a race, and the loser gets a module the mocks never reached.
 */
let eventApi: Promise<typeof import("@tauri-apps/api/event")> | null = null;

function tauriEvents() {
  eventApi ??= import("@tauri-apps/api/event");
  return eventApi;
}

/** Subscribes to a Tauri event, if there is a Tauri to subscribe to. */
function useTauriEvent(name: string, handler: () => void): void {
  // Read through a ref: the handler closes over the block running right now,
  // and re-subscribing every tick would be a lot of listeners.
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let gone = false;

    void tauriEvents()
      .then(({ listen }) => listen(name, () => latest.current()))
      .then(
        (stop) => {
          if (gone) {
            stop();
          } else {
            unlisten = stop;
          }
        },
        () => {
          // No Tauri event bus — a browser, a test. There is no tray to click
          // in either, so there is nothing to report.
        },
      );

    return () => {
      gone = true;
      unlisten?.();
    };
  }, [name]);
}

export function useTray(
  { block, now }: RunningBlock,
  onToggleRequested: () => void,
): void {
  const { t } = useTranslation();

  const minutesLeft = block
    ? Math.ceil(remainingSeconds(block, now) / SECONDS_PER_MINUTE)
    : null;

  const labels: TrayLabels = {
    show: t("tray.show"),
    toggle: block ? t("tray.stop") : t("tray.start"),
    quit: t("tray.quit"),
    tooltip:
      minutesLeft === null
        ? t("app.name")
        : t("tray.remaining", { minutes: minutesLeft }),
  };

  // One message per changed word rather than one per render: the language
  // rarely changes, and the tooltip only every sixtieth tick. What was last
  // said is the only guard — no dependency array — so that a sync which
  // failed can be tried again on the very next render.
  const sent = useRef<string | null>(null);
  const signature = JSON.stringify(labels);

  useEffect(() => {
    if (signature === sent.current) {
      return;
    }
    sent.current = signature;

    // A failure is forgotten rather than remembered as said. Otherwise a tray
    // that failed to appear while nothing was running would never be
    // attempted twice — the words do not change while the app sits idle.
    void syncTray(labels).catch(() => {
      sent.current = null;
    });
  });

  useTauriEvent(TOGGLE_TIMER_EVENT, onToggleRequested);

  useTauriEvent(HIDDEN_TO_TRAY_EVENT, () => {
    void explainHiddenToTray({
      title: t("app.name"),
      body: t("tray.hiddenNotice"),
    });
  });
}
