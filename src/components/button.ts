/**
 * Every button in the app, as four treatments and a toggle.
 *
 * The commit button was copied verbatim into four screens before this file
 * existed, and by then two of the copies disagreed about how faded a disabled
 * button is; the quiet one was copied into four more. So there is one file, and
 * a screen that dresses its own button is a defect the vocabulary guard fails on
 * — in the way a raw hex or a raw duration is (ADR-0004).
 *
 * All of them are soft raised fills rather than outlined boxes: outlining the
 * card, the field and the control all at once is what made the screens read as
 * chaotic. Tokens only, and every transition names a motion tier.
 */

/** The one button that commits something. Loudest thing on its screen. */
export const primaryButtonClass =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-surface " +
  "transition-opacity motion-quick hover:opacity-90 disabled:opacity-40";

/** A real button that is not the point of the screen: Browse, Check again. */
export const quietButtonClass =
  "rounded-md bg-surface-soft px-4 py-2 text-sm text-ink-muted " +
  "transition-colors motion-quick hover:text-ink disabled:opacity-40";

/**
 * A quiet button that steps towards losing something — Stop, Discard.
 *
 * It hovers terracotta rather than wearing it: the colour is the warning, and a
 * button that is red before it is pointed at reads as the screen's subject.
 */
export const quietDangerButtonClass =
  "rounded-md bg-surface-soft px-4 py-2 text-sm text-ink-muted " +
  "transition-colors motion-quick hover:text-danger disabled:opacity-40";

/**
 * A row action: no fill at all, because a row that carries three of these reads
 * as a toolbar rather than as a name.
 */
export const linkButtonClass =
  "text-xs font-medium text-ink-muted " +
  "transition-colors motion-quick hover:text-ink disabled:opacity-40";

/** The row action that removes something. */
export const linkDangerButtonClass =
  "text-xs font-medium text-ink-muted " +
  "transition-colors motion-quick hover:text-danger disabled:opacity-40";

const toggleClass =
  "rounded-full px-3 py-1.5 text-sm transition-colors motion-quick " +
  "disabled:opacity-40";

/**
 * One of a set where exactly one answer is in force: a preset length, a report
 * range, a grouping.
 *
 * The one in force is filled rather than outlined, so the difference between the
 * answer and the alternatives is weight rather than a line — `aria-pressed`
 * carries it for anyone not reading the fill.
 */
export function toggleButtonClass(chosen: boolean): string {
  return chosen
    ? `${toggleClass} bg-accent font-medium text-surface`
    : `${toggleClass} bg-surface-soft text-ink-muted hover:text-ink`;
}
