/*
 * User-defined custom color palette (#43). Persisted in plugin settings and
 * offered by every Color picker (after the standard palette). Reached via the
 * getPlugin() singleton (D7) so pickers/settings share one source of truth.
 */
import { getPlugin } from "../globals";

const eq = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The user's saved custom colors (CSS values), in order. */
export function customColors(): string[] {
	return getPlugin().settings.customColors ?? [];
}

/** Adds `color` to the palette (case-insensitive dedup) and persists. */
export async function addCustomColor(color: string): Promise<void> {
	const value = color.trim();
	if (!value) return;
	const plugin = getPlugin();
	const list = plugin.settings.customColors ?? (plugin.settings.customColors = []);
	if (list.some((c) => eq(c, value))) return;
	list.push(value);
	await plugin.saveSettings();
}

/** Removes `color` from the palette (case-insensitive) and persists. */
export async function removeCustomColor(color: string): Promise<void> {
	const plugin = getPlugin();
	const list = plugin.settings.customColors ?? [];
	const next = list.filter((c) => !eq(c, color));
	if (next.length === list.length) return;
	plugin.settings.customColors = next;
	await plugin.saveSettings();
}
