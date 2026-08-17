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

const quietClass =
  "rounded-md soft-fill px-4 py-2 text-sm text-ink-muted " +
  "transition-colors motion-quick disabled:opacity-40";

/** A real button that is not the point of the screen: Browse, Check again. */
export const quietButtonClass = `${quietClass} hover:text-ink`;

/**
 * A quiet button that steps towards losing something — Stop, Discard.
 *
 * It hovers terracotta rather than wearing it: the colour is the warning, and a
 * button that is red before it is pointed at reads as the screen's subject.
 */
export const quietDangerButtonClass = `${quietClass} hover:text-danger`;

/**
 * A row action: no fill at all, because a row that carries three of these reads
 * as a toolbar rather than as a name.
 */
const linkClass =
  "text-xs font-medium text-ink-muted " +
  "transition-colors motion-quick disabled:opacity-40";

export const linkButtonClass = `${linkClass} hover:text-ink`;

/** The row action that removes something. */
export const linkDangerButtonClass = `${linkClass} hover:text-danger`;

/** The trigger that opens a row's action menu: an icon, nothing more. */
export const menuTriggerClass =
  "grid size-7 place-items-center rounded-md text-ink-muted " +
  "transition-colors motion-quick hover:soft-fill hover:text-ink";

/** An item inside the action menu a row trigger opens. */
export const menuItemClass =
  "mx-1 rounded-md px-2 py-1.5 text-left text-sm text-ink-muted " +
  "transition-colors motion-quick hover:bg-surface-soft hover:text-ink disabled:opacity-40";

/**
 * The window's own minimize and close (ADR-0004).
 *
 * 28x28 with a glyph in it, rather than the 12px bare circles it replaces: a
 * target that small is hard to hit, and a circle with nothing in it does not say
 * which one it is. Transparent until pointed at, because the chrome is not the
 * subject of any screen.
 */
const windowButtonClass =
  "grid size-7 place-items-center rounded-md text-ink-muted " +
  "transition motion-quick active:scale-95";

export const minimizeButtonClass = `${windowButtonClass} hover:soft-fill hover:text-ink`;

/**
 * Close hovers terracotta rather than the usual harsh red, and wears the fill
 * rather than tinting its glyph: this button is a step away, not a destruction —
 * it does not even end a running block — but it is also the one on the corner,
 * and the fill is what a hand aiming at it expects to light up.
 */
export const closeButtonClass = `${windowButtonClass} hover:bg-danger hover:text-surface`;

/**
 * Tabular figures because half of these are numbers — a preset length, a week —
 * and digits that change width make a set of them twitch.
 */
const toggleClass =
  "rounded-full px-3 py-1.5 text-sm tabular-nums " +
  "transition-colors motion-quick disabled:opacity-40";

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
    : `${toggleClass} soft-fill text-ink-muted hover:text-ink`;
}
