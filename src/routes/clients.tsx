import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { chipClass, primaryButtonClass } from "../components/button";
import {
  checkboxLabelClass,
  fieldClass,
  quietLabelClass,
} from "../components/field";
import { Icon } from "../components/icon";
import { NameForm } from "../components/name-form";
import { RefusalLine } from "../components/refusal-line";
import { RowMenu } from "../components/row-menu";
import { TransientDisclosure } from "../components/transient";
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
type Editing = {
  target: Target;
  item: { id: number; name: string } | null;
  /**
   * Which Client a new Project would belong to. A form asking only for a name
   * cannot say that for itself, and the row it was raised on is not the answer
   * either — that row can be closed and another opened while it stands.
   */
  clientId?: number;
};

export function Clients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rowError, setRowError] = useState<{
    target: Target;
    message: string;
  } | null>(null);

  const clients = useQuery({
    queryKey: ["clients", showArchived],
    queryFn: () => listClients(showArchived),
  });

  /**
   * Every Project on the screen, in one read. A row that fetched its own would
   * render its body empty on the first open — the height the disclosure
   * measures — and fill it mid-animation, landing on a size it never animated
   * to. Held here, the body is at its true height before it is ever measured.
   *
   * These are the two lists the Timer and the Entries screen already ask for,
   * so they are asked for under the same two names: one cache, and one
   * invalidation that reaches every screen showing a Project.
   */
  const allProjects = useQuery({
    queryKey: ["projects", showArchived ? "all" : "offerable"],
    queryFn: () => listProjects({ includeArchived: showArchived }),
  });

  const projects = allProjects.data ?? [];
  const allClients = clients.data ?? [];
  const term = search.toLowerCase();
  const filtered = term
    ? allClients.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          projects.some(
            (p) =>
              p.clientId === c.id && p.name.toLowerCase().includes(term),
          ),
      )
    : allClients;

  /**
   * The screen has one arrival, not two. A row offered before its Projects have
   * landed can be opened onto a body that has nothing in it yet, which is the
   * measurement this change is here to stop — and an empty list is not yet
   * grounds for saying there is nothing.
   */
  const loading = clients.isPending || allProjects.isPending;

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

  const openForm = (
    target: Target,
    item: { id: number; name: string } | null,
    clientId?: number,
  ) => {
    setFormError(null);
    clearRowError(target);
    setEditing({ target, item, clientId });
  };

  const addingClient = editing?.target === "clients" && editing.item === null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className={quietLabelClass}>{t("clients.title")}</h2>
        <button
          type="button"
          onClick={() => openForm("clients", null)}
          className={`${primaryButtonClass} flex shrink-0 items-center gap-1.5`}
        >
          <Icon name="add" className="size-4" />
          {t("clients.addClient")}
        </button>
      </header>

      <input
        type="search"
        placeholder={t("clients.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={fieldClass}
      />

      <label className={checkboxLabelClass}>
        <input
          type="checkbox"
          role="switch"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
          className="switch-track"
        />
        {t("clients.showArchived")}
      </label>

      <RefusalLine
        message={rowError?.target === "clients" ? rowError.message : null}
      />

      <TransientDisclosure>
        {addingClient ? (
          <NameForm
            title={t("clients.newClient")}
            initialName=""
            busy={saveClient.isPending}
            error={formError}
            onSubmit={(name) => saveClient.mutate({ item: null, name })}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </TransientDisclosure>

      {loading ? null : filtered.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("clients.noClients")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((client) => (
            <ClientRow
              key={client.id}
              client={client}
              projects={projects.filter((p) => p.clientId === client.id)}
              open={expanded === client.id}
              onToggle={() =>
                setExpanded(expanded === client.id ? null : client.id)
              }
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
              onAddProject={() => {
                // The menu is on the row and the form it raises is inside the
                // body, so a closed row would raise it nowhere. Opening is
                // part of the action rather than a step asked of the user.
                setExpanded(client.id);
                openForm("projects", null, client.id);
              }}
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
  projects,
  open,
  onToggle,
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
  projects: Project[];
  open: boolean;
  onToggle: () => void;
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
  const addingProject =
    editing?.target === "projects" &&
    editing.item === null &&
    editing.clientId === client.id;

  const menuItems = [
    {
      label: t("clients.addProject"),
      ariaLabel: t("clients.addProjectNamed", { name: client.name }),
      icon: "add" as const,
      onClick: onAddProject,
    },
    {
      label: t("clients.rename"),
      ariaLabel: t("clients.renameNamed", { name: client.name }),
      icon: "rename" as const,
      onClick: onEditClient,
    },
    archived
      ? {
          label: t("clients.restore"),
          ariaLabel: t("clients.restoreNamed", { name: client.name }),
          icon: "unarchive" as const,
          onClick: onMoveClient,
          disabled: movingClient,
        }
      : {
          label: t("clients.archive"),
          ariaLabel: t("clients.archiveNamed", { name: client.name }),
          icon: "archive" as const,
          onClick: onMoveClient,
          disabled: movingClient,
        },
  ];

  return (
    <li
      data-client={client.id}
      className="rounded-lg bg-surface-raised"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex items-center gap-1.5 truncate text-sm text-ink transition-colors motion-quick hover:text-accent"
          >
            <Icon
              name="chevron"
              className={`size-3 shrink-0 transition-transform motion-base ${open ? "" : "rotate-180"}`}
            />
            {client.name}
          </button>

          {archived ? (
            <span className={`shrink-0 ${chipClass}`}>
              {t("clients.archived")}
            </span>
          ) : null}
        </span>

        <RowMenu
          label={t("clients.actionsNamed", { name: client.name })}
          items={menuItems}
        />
      </div>

      <TransientDisclosure>
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
      </TransientDisclosure>

      <TransientDisclosure>
        {open ? (
          <div className="flex flex-col gap-2 px-4 py-3">
            <RefusalLine
              message={rowError?.target === "projects" ? rowError.message : null}
            />

            <TransientDisclosure>
              {addingProject ? (
                <NameForm
                  title={t("clients.newProject")}
                  initialName=""
                  busy={savingProject}
                  error={formError}
                  onSubmit={(name) => onSaveProject(null, name)}
                  onCancel={onCancelProjectEdit}
                />
              ) : null}
            </TransientDisclosure>

            {projects.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {t("clients.noProjects")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {projects.map((project) => (
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

          </div>
        ) : null}
      </TransientDisclosure>
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

  const menuItems = [
    {
      label: t("clients.rename"),
      ariaLabel: t("clients.renameNamed", { name: project.name }),
      icon: "rename" as const,
      onClick: onEdit,
    },
    archived
      ? {
          label: t("clients.restore"),
          ariaLabel: t("clients.restoreNamed", { name: project.name }),
          icon: "unarchive" as const,
          onClick: onMove,
          disabled: movingProject,
        }
      : {
          label: t("clients.archive"),
          ariaLabel: t("clients.archiveNamed", { name: project.name }),
          icon: "archive" as const,
          onClick: onMove,
          disabled: movingProject,
        },
  ];

  return (
    <li className="flex flex-col rounded-md bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-ink">
            {project.name}
          </span>

          {archived ? (
            <span className={`shrink-0 ${chipClass}`}>
              {t("clients.archived")}
            </span>
          ) : null}
        </span>

        <RowMenu
          label={t("clients.actionsNamed", { name: project.name })}
          items={menuItems}
        />
      </div>

      <TransientDisclosure>
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
      </TransientDisclosure>
    </li>
  );
}
