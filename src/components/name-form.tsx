import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fieldClass, labelClass } from "./field";
import { Icon } from "./icon";
import { RefusalLine } from "./refusal-line";

interface NameFormProps {
  /** Names the form out loud — "Nieuwe klant", "Project hernoemen". */
  title: string;
  initialName: string;
  busy: boolean;
  /** A rejection from the command layer, already translated. */
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * The one field a client or a project is created and renamed by.
 *
 * A name is all it asks for: notes and `hourly_rate` are carried through
 * untouched by the caller, because a rename is not the place to lose them.
 * Whitespace is left alone — Rust is the one that decides a name is blank.
 */
export function NameForm({
  title,
  initialName,
  busy,
  error,
  onSubmit,
  onCancel,
}: NameFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);

  return (
    <form
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name);
      }}
      className="flex flex-col gap-3 rounded-lg bg-surface-raised p-3"
    >
      <label className={labelClass}>
        {t("clients.name")}
        <input
          className={fieldClass}
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <RefusalLine message={error} />

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface transition-opacity motion-quick hover:opacity-90 disabled:opacity-40"
        >
          <Icon name="save" className="size-4" />
          {t("clients.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-ink-muted transition-colors motion-quick hover:text-ink"
        >
          {t("clients.cancel")}
        </button>
      </div>
    </form>
  );
}
