#!/usr/bin/env python3
"""One-time migration: bare-name `fileClass:` values → wikilinks.

The wikilink-referenced fileClass fork resolves `fileClass:` only when its value
is a wikilink (`[[Name.fileclass]]`). This rewrites existing notes that still use
bare names (`fileClass: Area.fileclass` / `[Area.fileclass, Task.fileclass]`).

Frontmatter-only, and ONLY the `fileClass` block — never prose, never other keys.
Preserves all other frontmatter bytes (targeted block rewrite, not a YAML
round-trip). Idempotent: values already in `[[...]]` form are left untouched.

Usage:
    python3 migrate-fileclass-wikilinks.py --vault /Users/nelson/obsidian-new            # dry-run (default)
    python3 migrate-fileclass-wikilinks.py --vault /Users/nelson/obsidian-new --apply    # write (backs up first)
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

FM_RE = re.compile(r"^---\n(.*?\n)---\n", re.S)
LINKED_RE = re.compile(r"\[\[.*?\]\]")

# Populated by build_name_map(): full basenames ({"Area.fileclass", ...}) and a
# short→full alias map ({"Area": "Area.fileclass", ...}). Unresolved values are
# collected in UNRESOLVED for a warning (they become dangling links either way).
FULL_NAMES: set[str] = set()
SHORT_TO_FULL: dict[str, str] = {}
UNRESOLVED: dict[str, int] = {}


def build_name_map(vault: Path) -> None:
    # Definitions may be pre-migration (.fileclass.md) or already migrated (.fileclass).
    for p in list(vault.rglob("*.fileclass.md")) + list(vault.rglob("*.fileclass")):
        if "/.trash/" in f"/{p.relative_to(vault).as_posix()}":
            continue
        base = p.name[: -len(".md")] if p.name.endswith(".fileclass.md") else p.name  # "Area.fileclass"
        FULL_NAMES.add(base)
        short = base[: -len(".fileclass")]  # e.g. "Area"
        SHORT_TO_FULL.setdefault(short, base)


def plan_renames(vault: Path) -> list[tuple[Path, Path]]:
    """Definition files to rename `X.fileclass.md` → `X.fileclass` (non-md format)."""
    out: list[tuple[Path, Path]] = []
    for p in vault.rglob("*.fileclass.md"):
        if "/.trash/" in f"/{p.relative_to(vault).as_posix()}":
            continue
        out.append((p, p.with_name(p.name[: -len(".md")])))
    return out


def resolve_target(raw: str) -> str:
    """Map a bare value to the fileClass note basename it should link to."""
    if raw in FULL_NAMES:
        return raw
    if raw in SHORT_TO_FULL:
        return SHORT_TO_FULL[raw]
    UNRESOLVED[raw] = UNRESOLVED.get(raw, 0) + 1
    return raw  # link as-is (will dangle) — surfaced in the warning


def to_link(token: str) -> str:
    """`Area.fileclass`/`Area` -> `"[[Area.fileclass]]"`; leave already-linked/empty as-is."""
    raw = token.strip().strip("\"'")
    if not raw:
        return token
    if LINKED_RE.search(token):
        return token
    return f'"[[{resolve_target(raw)}]]"'


def rewrite_fileclass_block(fm: str) -> tuple[str, bool]:
    """Rewrite the `fileClass:` value(s) in a frontmatter string. Returns (new_fm, changed)."""
    lines = fm.split("\n")
    out: list[str] = []
    changed = False
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^(fileClass:)(.*)$", line)
        if not m:
            out.append(line)
            i += 1
            continue
        rest = m.group(2).strip()
        if rest == "":
            # Block list follows (indented `- ` items) OR an empty value.
            out.append(line)
            i += 1
            while i < len(lines) and re.match(r"^\s*-\s+", lines[i]):
                item = lines[i]
                im = re.match(r"^(\s*-\s+)(.*)$", item)
                new_val = to_link(im.group(2))
                if new_val != im.group(2).strip() and new_val != im.group(2):
                    changed = True
                out.append(f"{im.group(1)}{new_val}")
                i += 1
            continue
        if rest.startswith("[") and rest.endswith("]"):
            # Inline flow list: fileClass: [A, B]
            inner = rest[1:-1]
            parts = [p for p in (s.strip() for s in inner.split(",")) if p != ""]
            new_parts = [to_link(p) for p in parts]
            if new_parts != parts:
                changed = True
            out.append(f"fileClass: [{', '.join(new_parts)}]")
            i += 1
            continue
        # Inline scalar: fileClass: Area.fileclass
        new_val = to_link(rest)
        if new_val != rest:
            changed = True
        out.append(f"fileClass: {new_val}")
        i += 1
    return "\n".join(out), changed


def process(text: str) -> tuple[str, bool]:
    m = FM_RE.match(text)
    if not m:
        return text, False
    fm = m.group(1)
    if "fileClass:" not in fm:
        return text, False
    new_fm, changed = rewrite_fileclass_block(fm)
    if not changed:
        return text, False
    return text[: m.start(1)] + new_fm + text[m.end(1) :], True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", required=True)
    ap.add_argument("--apply", action="store_true", help="write changes (otherwise dry-run)")
    args = ap.parse_args()

    vault = Path(args.vault)
    if not vault.is_dir():
        print(f"not a directory: {vault}", file=sys.stderr)
        return 2

    build_name_map(vault)
    print(f"{len(FULL_NAMES)} fileClass definitions found in vault.\n")

    renames = plan_renames(vault)
    print(f"{len(renames)} definition file(s) to rename .fileclass.md → .fileclass:")
    for src, dst in renames:
        print(f"    {src.relative_to(vault)}  →  {dst.name}")
    print()

    targets: list[tuple[Path, str, str]] = []
    for p in vault.rglob("*.md"):
        rel = p.relative_to(vault).as_posix()
        if "/.trash/" in f"/{rel}" or rel.startswith(".trash/"):
            continue
        if p.name.endswith(".fileclass.md"):  # skip definitions themselves
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except Exception:
            continue
        new_text, changed = process(text)
        if changed:
            targets.append((p, text, new_text))

    print(f"{len(targets)} note(s) to migrate (dry-run={'no' if args.apply else 'yes'})\n")
    for p, old, new in targets:
        old_fc = "\n".join(l for l in old.split("\n") if l.startswith("fileClass") or re.match(r"^\s*-\s", l))
        print(f"— {p.relative_to(vault)}")
        for a, b in zip(FM_RE.match(old).group(1).split("\n"), FM_RE.match(new).group(1).split("\n")):
            if a != b:
                print(f"    - {a}\n    + {b}")

    if UNRESOLVED:
        print("\n⚠ Values with NO matching *.fileclass.md definition (links will dangle):")
        for name, n in sorted(UNRESOLVED.items()):
            print(f"    {name}  ({n} occurrence(s))")

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to write (a backup is made first).")
        return 0

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    backup = vault.parent / f"{vault.name}.fileclass-migration-backup-{stamp}"
    print(f"\nBacking up changed files to {backup} ...")
    for p, old, _ in targets:
        dst = backup / p.relative_to(vault)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(old, encoding="utf-8")
    for src, _ in renames:
        dst = backup / src.relative_to(vault)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    # Rename definition files first, then rewrite note references.
    for src, dst in renames:
        src.rename(dst)
    for p, _, new in targets:
        p.write_text(new, encoding="utf-8")
    print(f"Renamed {len(renames)} definition(s); migrated {len(targets)} note(s). Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
