/*
 * Pure helper for the "Add fileClass" write path. fileClass values are wikilinks
 * (a scalar string or a list of link strings); adding a class means appending its
 * generated link to that list without duplicating it. Kept obsidian-free so it is
 * unit-tested; the modal wires it to `generateMarkdownLink` + `processFrontMatter`.
 */

/** Normalizes the current alias value to a string[] and appends `link` if absent. */
export function mergeFileClassLink(current: unknown, link: string): string[] {
	const list = Array.isArray(current)
		? current.map((n) => String(n))
		: typeof current === "string" && current.trim()
			? [current.trim()]
			: [];
	if (!list.includes(link)) list.push(link);
	return list;
}
