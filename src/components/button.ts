/**
 * The one button that commits something.
 *
 * It was copied verbatim into four screens before this file existed, and by
 * then two of the copies disagreed about how faded a disabled button is. Tokens
 * only, never raw hex (ADR-0004).
 */

export const primaryButtonClass =
  "rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface " +
  "transition-opacity hover:opacity-90 disabled:opacity-40";
