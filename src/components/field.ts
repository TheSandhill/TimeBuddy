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
  "rounded-md bg-surface-soft px-3 py-2 text-sm text-ink disabled:opacity-50";

/**
 * A checkbox and the sentence it belongs to. Full-size text, because the label
 * *is* the control's meaning — there is nothing else to read it against.
 */
export const checkboxLabelClass = "flex items-center gap-2 text-sm text-ink";
