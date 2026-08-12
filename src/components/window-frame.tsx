import type { ReactNode } from "react";
import { useSavedAppearance } from "../theme/use-appearance";
import { TimerLifecycleProvider, useTimerLifecycle } from "../timer/lifecycle";
import { useTray } from "../tray/use-tray";
import { Titlebar } from "./titlebar";

/**
 * Everything that belongs to the window rather than to a screen.
 *
 * The theme, the custom titlebar and the tray are wanted before there is an
 * app to speak of: the lock screen and the first-run wizard are still windows
 * with no native decorations (ADR-0004), and an app that cannot be dragged,
 * closed or quit until someone types a password is not locked, it is stuck.
 *
 * The running block's lifecycle is here for a related reason: a block outlives
 * every screen, so the state governing it has to sit above the `<Outlet/>`
 * rather than inside whichever route is mounted (ADR-0010).
 */
export function WindowFrame({
  children,
  onTrayToggle,
  onTrayPause,
  revealsWork = true,
}: {
  children: ReactNode;
  /**
   * What the tray's Start/Stop item does. Absent behind the lock screen,
   * where there is no work to act on — the tray is there for Show and Quit.
   */
  onTrayToggle?: () => void;
  /**
   * The same for its Pause/Resume item. Absent behind the lock screen for the
   * same reason, where the item is greyed anyway: nothing is read while the
   * door is shut, so as far as the frame is concerned no block is in flight.
   */
  onTrayPause?: () => void;
  /**
   * Whether the frame may say anything about the work being done. False
   * behind the lock screen: a block keeps running there, but a countdown on
   * the titlebar would answer a question the door was put up to ask first.
   */
  revealsWork?: boolean;
}) {
  useSavedAppearance();

  return (
    <TimerLifecycleProvider watching={revealsWork}>
      <Chrome onTrayToggle={onTrayToggle} onTrayPause={onTrayPause}>
        {children}
      </Chrome>
    </TimerLifecycleProvider>
  );
}

/**
 * Inside the provider, because the pill and the tooltip watch the same block as
 * the lifecycle does — read once, so they cannot disagree about what second it
 * is.
 */
function Chrome({
  children,
  onTrayToggle,
  onTrayPause,
}: {
  children: ReactNode;
  onTrayToggle?: () => void;
  onTrayPause?: () => void;
}) {
  const { block, now, orphan } = useTimerLifecycle();

  useTray(
    { block, now },
    {
      orphaned: orphan !== null,
      onToggleRequested: () => onTrayToggle?.(),
      onPauseRequested: () => onTrayPause?.(),
    },
  );

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <Titlebar block={block} now={now} />
      {children}
    </div>
  );
}
