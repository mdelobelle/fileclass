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
	}
}
