import { useTranslation } from "react-i18next";
import type { Instant } from "../data/types";
import { NameForm } from "./name-form";

/**
 * What clients and projects have in common: a name, and a way out that is not
 * a delete. The Rust side shares `archive.rs` between the two for the same
 * reason — one rule, written once.
 */
export interface Archivable {
  id: number;
  name: string;
  archivedAt: Instant | null;
}

/** The wording that differs per column, translated by the caller. */
export interface ArchivableLabels {
  /** Names the column: "Klanten", "Projecten". */
  title: string;
  /** The button that opens the add form: "Klant toevoegen". */
  add: string;
  /** Names the add form: "Nieuwe klant". */
  addTitle: string;
  /** Names the rename form: "Klant hernoemen". */
  renameTitle: string;
  /** What the column says when it holds nothing. */
  empty: string;
}

/** Which form is open in this column: the add form (`null`), or a rename. */
export type OpenForm = { item: Archivable | null };

interface ArchivableListProps<T extends Archivable> {
  labels: ArchivableLabels;
  items: T[];
  /**
   * Omitted where rows are not selectable. Projects are the detail, so they
   * have nothing to select into.
   */
  selectedId?: number;
  onSelect?: (item: T) => void;
  editing: OpenForm | null;
  onAdd: () => void;
  onEdit: (item: T) => void;
  onCancel: () => void;
  onSubmit: (item: T | null, name: string) => void;
  onArchive: (item: T) => void;
  onRestore: (item: T) => void;
  /** A write from the open form is in flight. */
  busy: boolean;
  /** An archive or restore is in flight — a second click would repeat it. */
  moving: boolean;
  /**
   * Why every row here is out of the pickers even though none of them is
   * archived itself — a project column under an archived client. `null` when
   * the rows speak for themselves.
   */
  inheritedBadge?: string | null;
  /** A rejected write. Belongs to whichever form is open. */
  formError: string | null;
  /** A rejected archive or restore — no form to put it in. */
  rowError: string | null;
}

const rowButton =
  "text-xs uppercase tracking-widest text-ink-muted transition-colors motion-quick hover:text-ink disabled:opacity-40";

/**
 * One column of things that are archived, never deleted.
 *
 * There is deliberately no delete button anywhere in here: hours hang off these
 * rows, and a delete would silently rewrite reports (`CONTEXT.md`). Archived
 * rows stay readable, badged, and offer only their way back.
 */
export function ArchivableList<T extends Archivable>({
  labels,
  items,
  selectedId,
  onSelect,
  editing,
  onAdd,
  onEdit,
  onCancel,
  onSubmit,
  onArchive,
  onRestore,
  busy,
  moving,
  inheritedBadge = null,
  formError,
  rowError,
}: ArchivableListProps<T>) {
  const { t } = useTranslation();

  return (
    <section aria-label={labels.title} className="flex min-w-0 flex-col gap-3">
      <header className="flex items-baseline justify-between gap-4 border-b border-border pb-1">
        <h2 className="text-xs uppercase tracking-widest text-ink-muted">
          {labels.title}
        </h2>
        <button type="button" onClick={onAdd} className={rowButton}>
          {labels.add}
        </button>
      </header>

      {rowError ? (
        <p role="alert" className="text-sm text-danger">
          {rowError}
        </p>
      ) : null}

      {editing && editing.item === null ? (
        <NameForm
          title={labels.addTitle}
          initialName=""
          busy={busy}
          error={formError}
          onSubmit={(name) => onSubmit(null, name)}
          onCancel={onCancel}
        />
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => {
            const archived = item.archivedAt !== null;
            const renaming = editing?.item?.id === item.id;

            return (
              <li key={item.id} className="flex flex-col gap-2 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    {onSelect ? (
                      <button
                        type="button"
                        onClick={() => onSelect(item)}
                        aria-current={item.id === selectedId}
                        className={`truncate text-sm transition-colors motion-quick ${
                          item.id === selectedId
                            ? "text-accent"
                            : "text-ink hover:text-accent"
                        }`}
                      >
                        {item.name}
                      </button>
                    ) : (
                      <span className="truncate text-sm text-ink">{item.name}</span>
                    )}

                    {/* One badge, not two: being archived outranks
                        inheriting it from a client. */}
                    {archived || inheritedBadge ? (
                      <span className="shrink-0 text-xs uppercase tracking-widest text-ink-muted">
                        {archived ? t("clients.archived") : inheritedBadge}
                      </span>
                    ) : null}
                  </span>

                  <span className="flex shrink-0 items-baseline gap-3">
                    <button
                      type="button"
                      aria-label={t("clients.renameNamed", { name: item.name })}
                      onClick={() => onEdit(item)}
                      className={rowButton}
                    >
                      {t("clients.rename")}
                    </button>

                    {archived ? (
                      <button
                        type="button"
                        disabled={moving}
                        aria-label={t("clients.restoreNamed", { name: item.name })}
                        onClick={() => onRestore(item)}
                        className={rowButton}
                      >
                        {t("clients.restore")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={moving}
                        aria-label={t("clients.archiveNamed", { name: item.name })}
                        onClick={() => onArchive(item)}
                        className={rowButton}
                      >
                        {t("clients.archive")}
                      </button>
                    )}
                  </span>
                </div>

                {renaming ? (
                  <NameForm
                    // A fresh form per row: the name is initial state, not a prop.
                    key={item.id}
                    title={labels.renameTitle}
                    initialName={item.name}
                    busy={busy}
                    error={formError}
                    onSubmit={(name) => onSubmit(item, name)}
                    onCancel={onCancel}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
