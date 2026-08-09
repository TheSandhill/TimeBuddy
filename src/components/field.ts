/**
 * The two class strings every form field in the app is dressed in.
 *
 * They were copied verbatim into three forms before this file existed. Tokens
 * only, never raw hex (ADR-0004) — that is what makes a user-authored theme a
 * later addition rather than a rewrite.
 */

export const fieldClass =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink";

export const labelClass =
  "flex flex-col gap-1 text-xs uppercase tracking-widest text-ink-muted";
