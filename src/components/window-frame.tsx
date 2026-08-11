import type { ReactNode } from "react";
import { useSavedAppearance } from "../theme/use-appearance";
import { useRunningBlock } from "../timer/use-running-block";
import { useTray } from "../tray/use-tray";
import { Titlebar } from "./titlebar";

/**
 * Everything that belongs to the window rather than to a screen.
 *
 * The theme, the custom titlebar and the tray are wanted before there is an
 * app to speak of: the lock screen and the first-run wizard are still windows
 * with no native decorations (ADR-0004), and an app that cannot be dragged,
 * closed or quit until someone types a password is not locked, it is stuck.
 */
export function WindowFrame({
  children,
  onTrayToggle,
  revealsWork = true,
}: {
  children: ReactNode;
  /**
   * What the tray's Start/Stop item does. Absent behind the lock screen,
   * where there is no Timer to act on — the tray is there for Show and Quit.
   */
  onTrayToggle?: () => void;
  /**
   * Whether the frame may say anything about the work being done. False
   * behind the lock screen: a block keeps running there, but a countdown on
   * the titlebar would answer a question the door was put up to ask first.
   */
  revealsWork?: boolean;
}) {
  useSavedAppearance();

  // The pill and the tooltip watch the same block, so the frame reads it once
  // and they cannot disagree about what second it is.
  const running = useRunningBlock(revealsWork);

  useTray(running, () => onTrayToggle?.());

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <Titlebar {...running} />
      {children}
    </div>
  );
}
