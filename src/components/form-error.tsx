/**
 * The one line a form says when the command layer refused it.
 *
 * It was copied verbatim into five forms before this file existed. `role`
 * matters as much as the colour: a rejection nobody is told about is the same
 * as one that did not happen.
 *
 * `error` rather than `warning` (ADR-0014): a form is refused because somebody
 * pressed submit, and nothing fell back. The glyph lives here rather than in
 * each form, so a screen that imports this is dressed by one edit — the screens
 * that still hand-roll this paragraph instead are the ones left to convert.
 */
import { Icon } from "./icon";

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="flex items-center gap-1.5 text-sm text-danger">
      <Icon name="error" className="size-4 shrink-0" />
      {message}
    </p>
  );
}
