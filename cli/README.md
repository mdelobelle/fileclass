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
```

Then expose the `fileclass` command. If your Node lives in a system location,
`npm link` needs a writable global prefix — pick one that avoids `sudo`:

**A. Shell alias (quickest, no global install)**

```bash
echo "alias fileclass='node $(pwd)/dist/cli.js'" >> ~/.zshrc && source ~/.zshrc
```

**B. User-owned npm prefix, then `npm link`**

```bash
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
npm link
```

**C. Symlink into a bin dir you already own (on your PATH)**

```bash
ln -sf "$(pwd)/dist/cli.js" ~/.local/bin/fileclass   # if ~/.local/bin is on PATH
```

(Or just run it directly: `node dist/cli.js <command>`. `sudo npm link` also
works but installing globally as root is best avoided.)

## Usage

```bash
fileclass tui                              # interactive browse + edit (ink)
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
export FILECLASS_VAULT=Work      # for a shell session / scripts
```

The plugin driving the CLI must be recent enough to expose `plugin.api`; each
vault runs its own plugin version.

## Configuration

- `OBSIDIAN_BIN` — path to the `obsidian` binary (default: `obsidian` on PATH).
- `FILECLASS_VAULT` — target vault for the shell session.
- `FILECLASS_QUIET` — hide the `vault:` stderr line.
- Config file: `~/.config/fileclass/config.json` (the `use` default).
