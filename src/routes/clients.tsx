/**
 * The Clients and Projects screen — master on the left, its detail on the
 * right. One screen, because a project only means anything under a client.
 *
 * Nothing here deletes. Hours hang off these rows, and a delete would silently
 * rewrite every report that already went out (`CONTEXT.md`). Archiving is the
 * only way out, and it is reversible.
 */

import { useState } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArchivableList, type Archivable } from "../components/archivable-list";
import { checkboxLabelClass } from "../components/field";
import {
  archiveClient,
  archiveProject,
  createClient,
  createProject,
  listClients,
  listProjects,
  restoreClient,
  restoreProject,
  updateClient,
  updateProject,
} from "../data/commands";
import { errorKey } from "../data/error-message";
import type { Client, Project } from "../data/types";

/** Which column a form belongs to. At most one form is open on the screen. */
type Column = "clients" | "projects";
type Editing = { column: Column; item: Archivable | null };

export function Clients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  /** A rejected write, kept apart: a failed archive is not the form's problem. */
  const [formError, setFormError] = useState<string | null>(null);
  /** Carries its column: a refused archive belongs above the list it failed in. */
  const [rowError, setRowError] = useState<{
    column: Column;
    message: string;
  } | null>(null);

  const clients = useQuery({
    queryKey: ["clients", showArchived],
    queryFn: () => listClients(showArchived),
  });

  // Falling back to the first client keeps the right-hand side answering a
  // question, including after the picked client archives itself out of view.
  const all = clients.data ?? [];
  const selected = all.find((client) => client.id === picked) ?? all[0] ?? null;

  const projects = useQuery({
    queryKey: ["projects", selected?.id, showArchived],
    // No client, no question to ask — `skipToken` says so in the type rather
    // than leaving a query function that has to assume one.
    queryFn: selected
      ? () =>
          listProjects({ clientId: selected.id, includeArchived: showArchived })
      : skipToken,
  });

  /** Archiving a client moves its projects too, so both lists always refresh. */
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
    ]);

  const saveClient = useMutation({
    // The notes ride along untouched: this form never asked about them.
    mutationFn: ({ item, name }: { item: Client | null; name: string }) =>
      item ? updateClient(item.id, name, item.notes) : createClient(name),
    onSuccess: async () => {
      setEditing(null);
      setFormError(null);
      await refresh();
    },
    onError: (error) => setFormError(t(errorKey(error))),
  });

  const saveProject = useMutation({
    // Likewise the rate: v1 shows no field for it, and dropping it here would
    // lose it the moment someone fixed a typo.
    mutationFn: ({
      item,
      name,
      clientId,
    }: {
      item: Project | null;
      name: string;
      /** The client whose column the form was opened in. */
      clientId: number;
    }) =>
      item
        ? updateProject(item.id, name, item.hourlyRate)
        : createProject(clientId, name),
    onSuccess: async () => {
      setEditing(null);
      setFormError(null);
      await refresh();
    },
    onError: (error) => setFormError(t(errorKey(error))),
  });

  const moveClient = useMutation({
    mutationFn: (client: Client) =>
      client.archivedAt === null
        ? archiveClient(client.id)
        : restoreClient(client.id),
    onSuccess: async () => {
      clearRowError("clients");
      await refresh();
    },
    onError: (error) =>
      setRowError({ column: "clients", message: t(errorKey(error)) }),
  });

  const moveProject = useMutation({
    mutationFn: (project: Project) =>
      project.archivedAt === null
        ? archiveProject(project.id)
        : restoreProject(project.id),
    onSuccess: async () => {
      clearRowError("projects");
      await refresh();
    },
    onError: (error) =>
      setRowError({ column: "projects", message: t(errorKey(error)) }),
  });

  /** Leaves the other column's message alone: it is still true over there. */
  const clearRowError = (column: Column) =>
    setRowError((current) => (current?.column === column ? null : current));

  const openForm = (column: Column, item: Archivable | null) => {
    setFormError(null);
    clearRowError(column);
    setEditing({ column, item });
  };

  const formIn = (column: Column) =>
    editing?.column === column ? { item: editing.item } : null;

  const rowErrorIn = (column: Column) =>
    rowError?.column === column ? rowError.message : null;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-end">
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="accent-accent"
          />
          {t("clients.showArchived")}
        </label>
      </header>

      <div className="grid grid-cols-2 gap-8">
        <ArchivableList<Client>
          labels={{
            title: t("clients.title"),
            add: t("clients.addClient"),
            addTitle: t("clients.newClient"),
            renameTitle: t("clients.renameClient"),
            empty: t("clients.noClients"),
          }}
          items={all}
          selectedId={selected?.id}
          onSelect={(client) => setPicked(client.id)}
          editing={formIn("clients")}
          onAdd={() => openForm("clients", null)}
          onEdit={(client) => openForm("clients", client)}
          onCancel={() => setEditing(null)}
          onSubmit={(item, name) => saveClient.mutate({ item, name })}
          onArchive={(client) => moveClient.mutate(client)}
          onRestore={(client) => moveClient.mutate(client)}
          busy={saveClient.isPending}
          moving={moveClient.isPending}
          formError={formError}
          rowError={rowErrorIn("clients")}
        />

        {selected ? (
          <ArchivableList<Project>
            labels={{
              title: t("clients.projects"),
              add: t("clients.addProject"),
              addTitle: t("clients.newProject"),
              renameTitle: t("clients.renameProject"),
              empty: t("clients.noProjects"),
            }}
            items={projects.data ?? []}
            editing={formIn("projects")}
            onAdd={() => openForm("projects", null)}
            onEdit={(project) => openForm("projects", project)}
            onCancel={() => setEditing(null)}
            onSubmit={(item, name) =>
              saveProject.mutate({ item, name, clientId: selected.id })
            }
            onArchive={(project) => moveProject.mutate(project)}
            onRestore={(project) => moveProject.mutate(project)}
            busy={saveProject.isPending}
            moving={moveProject.isPending}
            // These projects are out of the pickers with nothing on the row to
            // say why: it is the client above them that was archived.
            inheritedBadge={
              selected.archivedAt ? t("clients.clientArchived") : null
            }
            formError={formError}
            rowError={rowErrorIn("projects")}
          />
        ) : null}
      </div>
    </section>
  );
}
