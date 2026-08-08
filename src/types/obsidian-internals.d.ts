/*
 * Ambient augmentation for Obsidian runtime members that exist at runtime but
 * are absent from the published `obsidian` type definitions.
 *
 * Kept out of `basesAdapter.ts` on purpose: that file is runtime-proven and
 * must not be edited (ARCHITECTURE.md D4/§6). This declaration only *types* an
 * existing, verified call (`metadataCache.isUserIgnored`, used by the adapter's
 * filtering loop, mirroring native Bases behavior — §3.1); it changes no logic.
 */
import "obsidian";

declare module "obsidian" {
	interface MetadataCache {
		/** True when `path` matches the user's "Excluded files" setting. */
		isUserIgnored(path: string): boolean;
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
