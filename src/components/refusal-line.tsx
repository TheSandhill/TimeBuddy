/**
 * The one line the app says when something the user asked for was refused.
 *
 * It was `FormError` until #88, and the rename is the decision this file records:
 * the paragraph is **the app's refusal line, not a form's**. Six of the nine
 * places that had pasted it inline were not forms at all — a failed export, a
 * failed delete, a screen that would not load — and the difference between "a
 * form was refused" and "a delete was refused" is not one the reader of a red
 * line can see. So there is one component rather than one for forms and a hand-
 * rolled copy everywhere else, and the next red line in the app belongs here
 * too.
 *
 * `role` matters as much as the colour: a refusal nobody is told about is the
 * same as one that did not happen.
 *
 * `error` rather than `warning` (ADR-0014): every caller is something the user
 * pressed or asked for, and in none of them is a fallback intact. A backwards
 * date range is the range they typed; Settings failing to load is the screen
 * they asked for with nothing left behind it.
 *
 * A banner is not a caller. `backup-banner`, `restore-banner`, `update-banner`
 * and `root-boundary` alert from a layout of their own, and `restore-notice` is a
 * `status` rather than an alert at all; each is a component in its own right,
 * wired by #70. What belongs here is the bare line, and `refusal-line.test.tsx`
 * fails if a second copy of it appears anywhere in `src`.
 */
import { Icon } from "./icon";

export function RefusalLine({ message }: { message: string | null }) {
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
