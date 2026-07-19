---
title: "CLI & API"
weight: 55
---

Fileclass exposes a **public plugin API** and ships a standalone **`fileclass`
CLI** (with an interactive **TUI**) so you can inspect, validate and edit typed
frontmatter from the terminal — reusing the plugin's own index, Bases queries
and validation engine, so results have full fidelity.

Both drive the **running Obsidian app** through Obsidian's own CLI
(`obsidian eval`). Obsidian must be running with the Fileclass plugin enabled.

> **⚠️ These tools write to your notes.** The API, the CLI and the TUI edit
> real frontmatter in your live vault — including **bulk** edits across many
> notes at once (`setValueWhere` / `fileclass set-where`). Writes go straight to
> disk and are **not undoable** from Fileclass. Handle them with care, prefer a
> dry run before a bulk change, and **keep regular backups** of your vault (Git,
> Obsidian Sync, or a file-level backup) — good practice for any tool that
> automates edits to your files.

## Public API

The plugin publishes a stable, JSON-serializable surface on its instance —
`app.plugins.plugins.fileclass.api` — reachable from `obsidian eval "…"` and
from the `fileclass` CLI. Everything is plain JSON (paths, field names, plain
values — never `TFile` or field objects with methods); mutations return
`{ ok, message }` and never throw for a domain error.

| Method | Purpose |
|--------|---------|
| `vaultInfo()` | vault name + absolute path |
| `listFileClasses()` | every fileClass (extends, field count, icon, `hasBase`) |
| `getSchema(fileClass)` | options + resolved fields (with ancestry) |
| `explain(path)` | a note's fileClasses, ancestry, and resolved field values |
| `getFields(path)` / `getValue(path, field)` | fields on a note / one value |
| `allowedValues(path, field)` | resolved allowed values for a choice field |
| `fileCandidates(path, field)` | link candidates for a File/Media field |
| `listNotes(fileClass, { columns?, where?, limit? })` | rows for a fileClass |
| `baseTable(fileClass)` | the fileClass's base view as columns/rows |
| `openSchema(fileClass)` | open the schema editor in the Obsidian window |
| `validate(scope?)` | schema violations for a fileClass / path / folder / vault |
| `setValue(path, field, value)` | **validated** single write |
| `clearValue(path, field)` | remove a field's key |
| `insertMissing(path)` | add missing fields to a note |
| `setValueWhere(fileClass, field, value, where?)` | validated bulk write |

`setValue` and `setValueWhere` validate before writing and refuse an invalid
value; `setValueWhere` also **skips** notes already at the target value (no
churn) and reports `{ changed, skipped, errors }`. Bases-dependent methods
degrade gracefully (return `null` / `[]`) when Bases is unavailable.

The API is **versioned** (`api.version`, currently `1.0`); breaking changes bump
it. The plugin driving the CLI must be recent enough to expose `plugin.api`.

> **⚠️ Mutating methods write to disk.** `setValue`, `clearValue`,
> `insertMissing` and `setValueWhere` change note frontmatter in the live vault.
> `setValueWhere` can touch **many notes in one call** — scope its `where` filter
> carefully. There is no built-in undo; back up your vault before scripting
> writes.

## Installing the CLI

The CLI lives in the plugin's `cli/` directory.

```bash
cd cli
npm install
npm run build
```

Then expose the `fileclass` command. If your Node lives in a system location,
`npm link` needs a writable global prefix — pick one that avoids `sudo`:

- **Shell alias** (quickest):
  `echo "alias fileclass='node $(pwd)/dist/cli.js'" >> ~/.zshrc`
- **User-owned npm prefix**, then `npm link`:
  `npm config set prefix ~/.npm-global` (and add its `bin` to `PATH`).
- **Symlink** into a bin dir on your `PATH`:
  `ln -sf "$(pwd)/dist/cli.js" ~/.local/bin/fileclass`.

Or just run it directly: `node dist/cli.js <command>`.

## CLI commands

```bash
fileclass tui                              # interactive browse + edit (TUI)
fileclass fileclasses                      # every fileClass
fileclass schema Book                      # a fileClass's options + fields
fileclass explain "Books/Dune.md"          # a note's fileClasses + resolved fields
fileclass list Book --columns title,author --where "status is unread" --limit 20
fileclass get "Books/Dune.md" status
fileclass set "Books/Dune.md" status read  # validated single write

# data quality (exit code 1 if any violation — CI-friendly)
fileclass validate --fileclass Book

# bulk edit (dry-run unless --apply)
fileclass set-where Book status "to read" --where "status isEmpty" --apply
```

Add `--json` to any command for machine-readable output. `validate` exits
non-zero when it finds a violation, so it drops straight into a CI or pre-commit
check.

> **⚠️ `set` and `set-where` modify your notes.** `set` writes a single value;
> `set-where` edits every matching note. `set-where` is a **dry run by default** —
> inspect the reported changes first, then re-run with `--apply`. Keep a backup
> before applying bulk edits.

## Interactive TUI

`fileclass tui` opens an [ink](https://github.com/vadimdemedes/ink)-based
terminal UI. From a home menu you can browse fileClasses → notes → fields and
**edit a value with typed input** — choice pickers for `Select`/`Cycle`,
candidate pickers with filtering for `File`/`Media` fields, and text input for
the rest. It also shows each note's **validation status** and lets you open a
fileClass's base or switch vaults. It talks to the same live API as the CLI, so
every edit is validated exactly as it would be in the app.

> **⚠️ TUI edits are saved immediately.** Confirming a value in the TUI writes it
> to the note's frontmatter right away — there is no separate save step and no
> undo. As with the CLI and API, keep regular backups of your vault.

## Choosing the vault

With several vaults open, pick which one commands run against. Every command
prints the target vault to stderr (`vault: <name>`). Precedence:

```
--vault <name>   >   FILECLASS_VAULT (env)   >   `fileclass use` default   >   active vault
```

```bash
fileclass vault                 # which vault am I talking to?
fileclass use Obsidian-Dev      # persist a default (survives sessions)
fileclass use --clear           # unset it
fileclass list Book --vault Work   # one-off override
```

## Configuration

| Variable / file | Purpose |
|-----------------|---------|
| `OBSIDIAN_BIN` | path to the `obsidian` binary (default: `obsidian` on `PATH`). |
| `FILECLASS_VAULT` | target vault for the shell session. |
| `FILECLASS_QUIET` | hide the `vault:` stderr line. |
| `~/.config/fileclass/config.json` | the persisted `fileclass use` default. |
