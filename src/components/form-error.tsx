/**
 * The one line a form says when the command layer refused it.
 *
 * It was copied verbatim into five forms before this file existed. `role`
 * matters as much as the colour: a rejection nobody is told about is the same
 * as one that did not happen.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  );
}
