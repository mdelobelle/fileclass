/*
 * fileClass identity constants (ARCHITECTURE.md §10, wikilink-references fork).
 * A fileClass definition is any note whose filename ends in `.fileclass.md`,
 * discovered vault-wide (no longer bounded by classFilesPath). Mirrors the
 * Blueprint plugin's dedicated-extension identity.
 */

/** Filename suffix that marks a note as a fileClass definition (discovery signal). */
export const FILECLASS_FILE_SUFFIX = ".fileclass.md" as const;

/** The `.fileclass` part carried in a fileClass's name/basename. */
export const FILECLASS_NAME_SUFFIX = ".fileclass" as const;

/** True when a path is a fileClass definition note, wherever it lives. */
export function isFileClassPath(path: string): boolean {
	return path.endsWith(FILECLASS_FILE_SUFFIX);
}
