# ADR-0005 — Archiving a Client hides its Projects

## Status

Accepted.

## Context

`CONTEXT.md` says an archived Client "hides it from pickers and keeps it in reports". Until the
Clients screen existed, nothing acted on the first half for Projects: `list_projects` filtered on
`projects.archived_at` alone, so archiving Acme left "Acme — Website" sitting in the Timer's picker
and in the Entries form. The user could start a block against a client they had just retired.

Three ways out were on the table:

1. **Cascade on write** — archiving a Client also sets `archived_at` on each of its Projects.
2. **Filter on read** — a Project is unofferable while its Client is archived; its own
   `archived_at` is untouched.
3. **Leave it** — make the UI archive the Projects by hand, one command per Project.

## Decision

Filter on read. `projects::list` with `include_archived = false` also excludes Projects whose
Client is archived:

```sql
AND (SELECT archived_at FROM clients WHERE clients.id = projects.client_id) IS NULL
```

## Consequences

- Restoring a Client restores exactly what archiving it hid. A cascade cannot do this: it would
  have to guess which Projects were already archived before the Client was, and it would guess
  wrong for anyone who archived a Project last month and the Client today.
- `include_archived` now means "archived, or belonging to an archived Client". One flag, two
  reasons — deliberate, because no caller has ever wanted to tell those two apart. A caller that
  one day does gets a second axis on `ProjectFilter`, not a workaround.
- Reports are untouched. `reports.rs` joins `projects` and `clients` without looking at
  `archived_at` at all, which is what makes archiving safe to do to a Client with hours behind it.
- Naming and offering became two different questions. The Timer and Entries screens now ask for
  every Project to *name* the hours already booked, and for offerable Projects to *fill the
  picker* — otherwise archiving a Client would relabel its past hours "Unknown project", which is
  exactly the silent rewriting of history that archive-never-delete exists to prevent.
- The Clients screen badges a live Project under an archived Client as "Client archived", so the
  screen can explain a disappearance it caused.
