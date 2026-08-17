/**
 * The Clients and Projects screen — an exclusive accordion, one row per
 * Client, its Projects inside it. Nothing is open on arrival, and opening
 * one closes the last.
 *
 * Nothing here deletes. Hours hang off these rows, and a delete would silently
 * rewrite every report that already went out (`CONTEXT.md`). Archiving is the
 * only way out, and it is reversible.
 */

import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { linkButtonClass } from "../components/button";
import { checkboxLabelClass, quietLabelClass } from "../components/field";
import { NameForm } from "../components/name-form";
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

type Target = "clients" | "projects";
type Editing = { target: Target; item: { id: number; name: string } | null };

export function Clients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    target: Target;
    message: string;
  } | null>(null);

  const clients = useQuery({
    queryKey: ["clients", showArchived],
    queryFn: () => listClients(showArchived),
  });

  const all = clients.data ?? [];

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
    ]);

  const saveClient = useMutation({
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
    mutationFn: ({
      item,
      name,
      clientId,
    }: {
      item: Project | null;
      name: string;
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
      setRowError({ target: "clients", message: t(errorKey(error)) }),
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
      setRowError({ target: "projects", message: t(errorKey(error)) }),
  });

  const clearRowError = (target: Target) =>
    setRowError((current) => (current?.target === target ? null : current));

  const openForm = (target: Target, item: { id: number; name: string } | null) => {
    setFormError(null);
    clearRowError(target);
    setEditing({ target, item });
  };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h2 className={quietLabelClass}>{t("clients.title")}</h2>
        <div className="flex items-center gap-4">
          <label className={checkboxLabelClass}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="accent-accent"
            />
            {t("clients.showArchived")}
          </label>
          <button
            type="button"
            onClick={() => openForm("clients", null)}
            className={linkButtonClass}
          >
            {t("clients.addClient")}
          </button>
        </div>
      </header>

      {rowError?.target === "clients" ? (
        <p role="alert" className="text-sm text-danger">
          {rowError.message}
        </p>
      ) : null}

      {editing?.target === "clients" && editing.item === null ? (
        <NameForm
          title={t("clients.newClient")}
          initialName=""
          busy={saveClient.isPending}
          error={formError}
          onSubmit={(name) => saveClient.mutate({ item: null, name })}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {all.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("clients.noClients")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {all.map((client) => (
            <ClientRow
              key={client.id}
              client={client}
              open={expanded === client.id}
              onToggle={() =>
                setExpanded(expanded === client.id ? null : client.id)
              }
              showArchived={showArchived}
              editing={editing}
              formError={formError}
              rowError={rowError}
              onEditClient={() => openForm("clients", client)}
              onCancelEdit={() => setEditing(null)}
              onSaveClient={(item, name) =>
                saveClient.mutate({ item, name })
              }
              savingClient={saveClient.isPending}
              onMoveClient={() => moveClient.mutate(client)}
              movingClient={moveClient.isPending}
              onEditProject={(project) => openForm("projects", project)}
              onAddProject={() => openForm("projects", null)}
              onCancelProjectEdit={() => setEditing(null)}
              onSaveProject={(item, name) =>
                saveProject.mutate({ item, name, clientId: client.id })
              }
              savingProject={saveProject.isPending}
              onMoveProject={(project) => moveProject.mutate(project)}
              movingProject={moveProject.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClientRow({
  client,
  open,
  onToggle,
  showArchived,
  editing,
  formError,
  rowError,
  onEditClient,
  onCancelEdit,
  onSaveClient,
  savingClient,
  onMoveClient,
  movingClient,
  onEditProject,
  onAddProject,
  onCancelProjectEdit,
  onSaveProject,
  savingProject,
  onMoveProject,
  movingProject,
}: {
  client: Client;
  open: boolean;
  onToggle: () => void;
  showArchived: boolean;
  editing: Editing | null;
  formError: string | null;
  rowError: { target: Target; message: string } | null;
  onEditClient: () => void;
  onCancelEdit: () => void;
  onSaveClient: (item: Client | null, name: string) => void;
  savingClient: boolean;
  onMoveClient: () => void;
  movingClient: boolean;
  onEditProject: (project: Project) => void;
  onAddProject: () => void;
  onCancelProjectEdit: () => void;
  onSaveProject: (item: Project | null, name: string) => void;
  savingProject: boolean;
  onMoveProject: (project: Project) => void;
  movingProject: boolean;
}) {
  const { t } = useTranslation();
  const archived = client.archivedAt !== null;
  const renaming = editing?.target === "clients" && editing.item?.id === client.id;

  const projects = useQuery({
    queryKey: ["projects", client.id, showArchived],
    queryFn: () =>
      listProjects({ clientId: client.id, includeArchived: showArchived }),
    enabled: open,
  });

  const projectList = projects.data ?? [];

  return (
    <li
      data-client={client.id}
      className="rounded-lg bg-surface-raised"
    >
      <div className="flex items-baseline justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="truncate text-sm text-ink transition-colors motion-quick hover:text-accent"
          >
            {client.name}
          </button>

          {archived ? (
            <span className={`shrink-0 ${quietLabelClass}`}>
              {t("clients.archived")}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-baseline gap-3">
          <button
            type="button"
            aria-label={t("clients.renameNamed", { name: client.name })}
            onClick={onEditClient}
            className={linkButtonClass}
          >
            {t("clients.rename")}
          </button>

          {archived ? (
            <button
              type="button"
              disabled={movingClient}
              aria-label={t("clients.restoreNamed", { name: client.name })}
              onClick={onMoveClient}
              className={linkButtonClass}
            >
              {t("clients.restore")}
            </button>
          ) : (
            <button
              type="button"
              disabled={movingClient}
              aria-label={t("clients.archiveNamed", { name: client.name })}
              onClick={onMoveClient}
              className={linkButtonClass}
            >
              {t("clients.archive")}
            </button>
          )}
        </span>
      </div>

      {renaming ? (
        <div className="px-4 pb-3">
          <NameForm
            key={client.id}
            title={t("clients.renameClient")}
            initialName={client.name}
            busy={savingClient}
            error={formError}
            onSubmit={(name) => onSaveClient(client, name)}
            onCancel={onCancelEdit}
          />
        </div>
      ) : null}

      <div
        className={`grid transition-[grid-template-rows] motion-bounce ease-bounce-soft ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {open ? (
            <div className="flex flex-col gap-2 rounded-b-lg bg-surface px-4 py-3">
              {rowError?.target === "projects" ? (
                <p role="alert" className="text-sm text-danger">
                  {rowError.message}
                </p>
              ) : null}

              {editing?.target === "projects" && editing.item === null ? (
                <NameForm
                  title={t("clients.newProject")}
                  initialName=""
                  busy={savingProject}
                  error={formError}
                  onSubmit={(name) => onSaveProject(null, name)}
                  onCancel={onCancelProjectEdit}
                />
              ) : null}

              {projectList.length === 0 && !projects.isLoading ? (
                <p className="text-sm text-ink-muted">
                  {t("clients.noProjects")}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {projectList.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      editing={editing}
                      formError={formError}
                      savingProject={savingProject}
                      movingProject={movingProject}
                      onEdit={() => onEditProject(project)}
                      onCancelEdit={onCancelProjectEdit}
                      onSave={(name) => onSaveProject(project, name)}
                      onMove={() => onMoveProject(project)}
                    />
                  ))}
                </ul>
              )}

              {editing?.target !== "projects" || editing.item !== null ? (
                <button
                  type="button"
                  onClick={onAddProject}
                  className={linkButtonClass}
                >
                  {t("clients.addProject")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ProjectRow({
  project,
  editing,
  formError,
  savingProject,
  movingProject,
  onEdit,
  onCancelEdit,
  onSave,
  onMove,
}: {
  project: Project;
  editing: Editing | null;
  formError: string | null;
  savingProject: boolean;
  movingProject: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (name: string) => void;
  onMove: () => void;
}) {
  const { t } = useTranslation();
  const archived = project.archivedAt !== null;
  const renaming =
    editing?.target === "projects" && editing.item?.id === project.id;

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-ink">
          {project.name}
        </span>

        {archived ? (
          <span className={`shrink-0 ${quietLabelClass}`}>
            {t("clients.archived")}
          </span>
        ) : null}

        <span className="flex shrink-0 items-baseline gap-3">
          <button
            type="button"
            aria-label={t("clients.renameNamed", { name: project.name })}
            onClick={onEdit}
            className={linkButtonClass}
          >
            {t("clients.rename")}
          </button>

          {archived ? (
            <button
              type="button"
              disabled={movingProject}
              aria-label={t("clients.restoreNamed", { name: project.name })}
              onClick={onMove}
              className={linkButtonClass}
            >
              {t("clients.restore")}
            </button>
          ) : (
            <button
              type="button"
              disabled={movingProject}
              aria-label={t("clients.archiveNamed", { name: project.name })}
              onClick={onMove}
              className={linkButtonClass}
            >
              {t("clients.archive")}
            </button>
          )}
        </span>
      </div>

      {renaming ? (
        <NameForm
          key={project.id}
          title={t("clients.renameProject")}
          initialName={project.name}
          busy={savingProject}
          error={formError}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      ) : null}
    </li>
  );
}
