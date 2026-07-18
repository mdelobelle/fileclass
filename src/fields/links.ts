/*
 * Wikilink formatting/parsing for link-type field values (ARCHITECTURE.md §7).
 * Links are stored in frontmatter as strings, honoring the user's link settings
 * via `generateMarkdownLink`. Media embeds are prefixed with "!".
 */
import { App, TFile } from "obsidian";

/** Builds the stored value for a link field (embed → `![[…]]`). */
export function formatLink(
	app: App,
	target: TFile,
	sourcePath: string,
	alias?: string,
	embed = false
): string {
	const link = app.fileManager.generateMarkdownLink(target, sourcePath, undefined, alias);
	return embed ? `!${link}` : link;
}

/** Resolves the target path of a stored link value (for pre-selecting a picker). */
export function linkTargetPath(app: App, raw: unknown, sourcePath: string): string | undefined {
	if (typeof raw !== "string") return undefined;
	// Match [[linktext]] / [[linktext|alias]] / ![[…]], else treat as bare linktext.
	const match = raw.match(/\[\[([^\]|#]+)/);
	const linktext = (match ? match[1] : raw).trim();
	if (!linktext) return undefined;
	return app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)?.path;
}
