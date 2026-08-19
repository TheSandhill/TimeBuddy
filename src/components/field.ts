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

/** The same, carrying a glyph: a group's legend, a set-apart block's heading. */
export const quietHeadingClass = `flex items-center gap-2 ${quietLabelClass}`;

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
 * What a `<select>` becomes once it draws its own list (#72).
 *
 * `appearance: base-select` rebases the field itself: it stops being a UA box
 * and becomes a button holding the selection plus a caret. The dressing — the
 * radius, the fill, the padding — stays on the select in `fieldClass` or
 * `pickerClass`, so this button gives back everything a button normally brings
 * and is left as nothing but layout: no box of its own inside the field's, and
 * the type it already had.
 */
export const selectButtonClass =
  "flex w-full min-w-0 items-center gap-2 border-0 bg-transparent p-0 " +
  "text-left text-inherit";

/**
 * The caret on the closed field: the icon set's chevron rather than the UA
 * triangle (ADR-0014). It points up and is turned here, so `:open` turns it back
 * — one glyph rotating rather than two swapping.
 */
export const selectCaretClass =
  "select-caret size-4 shrink-0 rotate-180 text-ink-muted " +
  "transition-transform motion-quick";

/**
 * A checkbox and the sentence it belongs to. Full-size text, because the label
 * *is* the control's meaning — there is nothing else to read it against.
 */
export const checkboxLabelClass = "flex items-center gap-2 text-sm text-ink";

/**
 * A named group of settings, divided from the last by a hairline rather than a
 * rule. The Settings screen is read as four of these.
 */
export const groupClass = "flex flex-col gap-4 border-t border-hairline pt-4";

/**
 * The one thing inside a group that is not like its neighbours — Restore.
 *
 * A raised panel rather than another hairline: a hairline says "next", and this
 * has to say "not the same kind of thing as the lines above it". The line round
 * it is the hairline the groups use, so the panel reads as lifted rather than
 * outlined.
 */
export const setApartClass =
  "flex flex-col gap-4 rounded-lg border border-hairline bg-surface-raised p-4";
