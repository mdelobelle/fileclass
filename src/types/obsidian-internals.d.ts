/*
 * Ambient augmentation for Obsidian runtime members that exist at runtime but
 * are absent from the published `obsidian` type definitions.
 *
 * `isUserIgnored` used to be declared here for the Bases adapter's filtering loop. The
 * `obsidian-bases-adapter` package now types that call inside itself — a library that
 * augments its host's types imposes them on every consumer — and nothing else in this plugin
 * calls it, so the declaration went with it (ARCHITECTURE.md D4/§3.1).
 */
import "obsidian";

declare module "obsidian" {
	interface MetadataCache {
		/** Every tag in the vault, `#tag` → how many notes carry it. */
		getTags(): Record<string, number>;
	}

	/**
	 * One entry of the Bookmarks core plugin. Only what a group picker needs: a group has a
	 * title and holds items, and anything else is a bookmark we do not read (#121).
	 */
	interface BookmarkItem {
		type: string;
		title?: string;
		/** Set on file/folder entries — the vault path the bookmark points at. */
		path?: string;
		items?: BookmarkItem[];
	}

	interface App {
		/** Core plugins, keyed by id. Absent from the published types. */
		internalPlugins?: {
			plugins: Record<
				string,
				{ enabled: boolean; instance?: { getBookmarks?(): BookmarkItem[] } } | undefined
			>;
		};
	}
}

// Obsidian injects `tokenClassNodeProp` into its shimmed @codemirror/language at
// runtime; it is absent from the published package types. Declaring it lets the
// Live Preview extension read a node's token classes (§19.4).
declare module "@codemirror/language" {
	import { NodeProp } from "@lezer/common";
	export const tokenClassNodeProp: NodeProp<string>;
}
