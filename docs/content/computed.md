---
title: "Computed fields"
weight: 35
---

Computed fields derive their value from other notes and are **persisted** to
frontmatter (so the whole ecosystem can read them). This page covers **Lookup**
fields; **Formula** fields come next.

## Lookup

A **Lookup** gathers information from the notes that link back to the current
one — a persisted reverse relation. Configure it on the field (schema editor):

- **Base file** + **View** — the source notes to scan (a `.base` view).
- **Target field** — the field on those source notes that links back here.
- **Output** — what to compute:
  - **LinksList** — the list of related notes as links.
  - **CountAll** — how many related notes.
  - **Count** — how many have a non-empty summarized field.
  - **Sum / Average / Max / Min** — over a numeric **Summarized field**.

For example, on a *Project* note a Lookup with base *Tasks*, target field
*project*, output *CountAll* yields the number of tasks whose `project` links to
that project.

### Recalculating

Run **Fileclass: recalculate lookups in current file** to recompute the current
note's Lookup fields. Each is resolved through the note's base view and written
in a single frontmatter write. Lookups require the core Bases plugin; without it
they are skipped.

> Automatic recalculation across all notes (and Lookup **status** indicators) is
> being built next.
