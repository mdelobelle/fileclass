/*
 * Global singleton (ARCHITECTURE.md D7).
 *
 * The bare Obsidian global `app` is forbidden across the codebase: modules
 * reach the plugin (and its `.app`) through `getPlugin()`, or take an explicit
 * `App` parameter (adapter/pure functions, for testability).
 */
import type FileclassPlugin from "../main";

let instance: FileclassPlugin | null = null;

/** Registers the plugin singleton. Called once from `FileclassPlugin.onload`. */
export function setPlugin(plugin: FileclassPlugin): void {
	instance = plugin;
}

/** Clears the singleton. Called from `FileclassPlugin.onunload`. */
export function clearPlugin(): void {
	instance = null;
}

/**
 * Returns the plugin singleton.
 * @throws if called before `onload` / after `onunload` (a programming error).
 */
export function getPlugin(): FileclassPlugin {
	if (!instance) {
		throw new Error(
			"Fileclass plugin accessed before load or after unload (getPlugin)."
		);
	}
	return instance;
}

/** True while the singleton is set. Prefer `getPlugin()` in feature code. */
export function hasPlugin(): boolean {
	return instance !== null;
}
