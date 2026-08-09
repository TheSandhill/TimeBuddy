import { useTranslation } from "react-i18next";

interface UndoToastProps {
  onUndo: () => void;
}

/**
 * The five seconds in which a delete is still a question.
 *
 * `role="status"` rather than `alert`: the row is already gone from the list,
 * so this is news, not a warning — but it must be announced, because the undo
 * disappears on its own.
 */
export function UndoToast({ onUndo }: UndoToastProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-6 mx-auto flex w-fit items-center gap-4 rounded-full border border-border bg-surface-raised px-5 py-2 text-sm text-ink shadow-lg"
    >
      <span>{t("entries.deleted")}</span>
      <button
        type="button"
        onClick={onUndo}
        className="text-sm font-medium text-accent transition-opacity hover:opacity-80"
      >
        {t("entries.undo")}
      </button>
    </div>
  );
}
