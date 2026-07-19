# fileclass CLI

Terminal access to the [Fileclass](https://mdelobelle.github.io/fileclass/)
Obsidian plugin — validate, inspect and edit typed frontmatter from the command
line. It drives the **running Obsidian app** through Obsidian's own CLI
(`obsidian eval`), reusing the plugin's index, Bases and validation engine — so
results have full fidelity. **Obsidian must be running** with the Fileclass
plugin enabled.

## Install

```bash
cd cli
npm install
npm run build
npm link          # exposes the `fileclass` command
```

## Usage

```bash
fileclass fileclasses                      # every fileClass
fileclass schema Book                      # a fileClass's options + fields
fileclass explain "Books/Dune.md"          # a note's fileClasses + resolved fields
fileclass list Book --columns title,author --where "status is unread" --limit 20
fileclass get "Books/Dune.md" status
fileclass set "Books/Dune.md" status read  # validated single write

# data quality (exit 1 if any violation — CI-friendly)
fileclass validate --fileclass Book

# bulk edit (dry-run unless --apply)
fileclass set-where Book status "to read" --where "status isEmpty" --apply
```

Add `--json` to any command for machine-readable output.

## Configuration

- `OBSIDIAN_BIN` — path to the `obsidian` binary (default: `obsidian` on PATH).
- `FILECLASS_VAULT` — target vault name when several are open.
