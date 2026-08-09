import type { Project } from "./types";

/**
 * The name to show for a project id.
 *
 * A list of hours can genuinely name a project the pickers don't offer:
 * projects are archived, never deleted, and yesterday's entries still point at
 * them. The fallback is the caller's because each screen names it in its own
 * corner of the catalogue.
 */
export function projectName(
  projects: Project[],
  projectId: number,
  fallback: string,
): string {
  return (
    projects.find((project) => project.id === projectId)?.name ?? fallback
  );
}
