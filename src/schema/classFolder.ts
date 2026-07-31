/*
 * Recognising the folder that holds fileClass notes.
 *
 * The setting is normalised with a trailing slash (`Classes/`), while Obsidian
 * hands folder paths without one (`Classes`), and the vault root arrives as `/`.
 * Pure so the edge cases are pinned by tests rather than by trial in the UI.
 */

/** True when `folderPath` *is* the class-files folder (not merely inside it). */
export function isClassFolder(folderPath: string, classFilesPath: string): boolean {
	if (!classFilesPath) return false; // no folder configured: nothing to recognise
	const folder = normalise(folderPath);
	return folder === normalise(classFilesPath);
}

/** True when `path` sits inside the class-files folder, at any depth. */
export function isInClassFolder(path: string, classFilesPath: string): boolean {
	if (!classFilesPath) return false;
	const folder = normalise(classFilesPath);
	return folder === "" ? true : normalise(path).startsWith(`${folder}/`);
}

/** `Classes/`, `/Classes`, `Classes` → `Classes`; the vault root → "". */
function normalise(path: string): string {
	return path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}
