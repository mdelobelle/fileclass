/*
 * fileClass identity constants (ARCHITECTURE.md §10, wikilink-references fork).
 * A fileClass definition is a **non-markdown `.fileclass` file** (like the
 * Blueprint plugin's `.blueprint`), discovered vault-wide by its extension.
 * Because it is not markdown, its schema is read via `vault.read` + `parseYaml`
 * (not `metadataCache`, which only indexes `.md`). Notes reference a definition
 * by wikilink (`fileClass: "[[Name.fileclass]]"`), which Obsidian resolves to the
 * non-md file by its full name.
 */

/** The custom file extension marking a fileClass definition. */
export const FILECLASS_EXTENSION = "fileclass" as const;

/** Filename/path suffix for a fileClass definition (`.fileclass`). */
export const FILECLASS_FILE_SUFFIX = ".fileclass" as const;

/** The `.fileclass` part carried in a fileClass's name (its full filename). */
export const FILECLASS_NAME_SUFFIX = ".fileclass" as const;

/** True when a path is a fileClass definition file, wherever it lives. */
export function isFileClassPath(path: string): boolean {
	return path.endsWith(FILECLASS_FILE_SUFFIX);
}
