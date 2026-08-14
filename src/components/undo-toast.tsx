interface UndoToastProps {
  /** What just happened, already phrased in the past tense by the caller. */
  message: string;
  actionLabel: string;
  onUndo: () => void;
}

/**
 * The five seconds in which something is still a question.
 *
 * `role="status"` rather than `alert`: the screen already shows the outcome, so
 * this is news, not a warning — but it must be announced, because the undo
 * disappears on its own.
 *
 * The words come from whoever raised it. A deleted entry and a stopped block are
 * different news, and one sentence for both would say neither.
 *
 * Where it floats and how it arrives belong to `TransientToast`, which is what
 * wraps it — this is the bar itself, so that the same bar can be given to
 * anything that needs one.
 */
export function UndoToast({ message, actionLabel, onUndo }: UndoToastProps) {
  return (
    <div
      role="status"
      className="flex w-fit items-center gap-4 rounded-full bg-surface-raised px-5 py-2 text-sm text-ink shadow-lg"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="text-sm font-medium text-accent transition-opacity motion-quick hover:opacity-80"
      >
        {actionLabel}
      </button>
    </div>
  );
}
