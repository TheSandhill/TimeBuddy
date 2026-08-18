/**
 * The class strings every form field, label and quiet heading is dressed in.
 *
 * They were copied verbatim into three forms before this file existed. Tokens
 * only, never raw hex (ADR-0004) — that is what makes a user-authored theme a
 * later addition rather than a rewrite.
 *
 * Labels are sentence case: uppercase and letter-spaced is a heading's voice,
 * and a field's label is not a heading. Fields are soft raised fills on the
 * grouping tokens rather than outlined boxes, so a form inside a card is two
 * shades rather than two frames.
 */

/** A quiet label or section heading, on its own. */
export const quietLabelClass = "text-xs font-medium text-ink-muted";

/** The same, wrapping the field it names. */
export const labelClass = `flex flex-col gap-1 ${quietLabelClass}`;

/** An input, a select or a textarea. */
export const fieldClass =
  "rounded-md soft-fill px-3 py-2 text-sm text-ink disabled:opacity-50";

/**
 * A select that is a block on a screen rather than a field in a form: the
 * Timer's project picker, sitting under the dial with today's entries.
 *
 * Raised rather than soft, and on the larger radius, because what it is grouped
 * with is the list beneath it rather than the fields of a form.
 */
export const pickerClass =
  "w-full rounded-lg bg-surface-raised px-4 py-3.5 text-sm text-ink " +
  "transition-colors motion-quick disabled:opacity-50";

/**
 * A checkbox and the sentence it belongs to. Full-size text, because the label
 * *is* the control's meaning — there is nothing else to read it against.
 */
export const checkboxLabelClass = "flex items-center gap-2 text-sm text-ink";
