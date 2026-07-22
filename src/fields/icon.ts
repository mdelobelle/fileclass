/*
 * Pure helpers for the Icon field (#32, ARCHITECTURE §7.1). No Obsidian: icon
 * enumeration/rendering (getIconIds/setIcon) lives in the picker; here we only
 * normalize ids and do a structural check the pure validator can run (the real
 * "is a registered icon" check is a picker/display concern — setIcon renders any
 * registered id and falls back to a not-found glyph otherwise).
 *
 * Storage is the bare icon id (e.g. `map-pin`), globally unique in Obsidian's
 * registry, which keeps core Bases Map view `icon` interop.
 */

const LUCIDE_PREFIX = "lucide-";

/** Drops the `lucide-` prefix so ids match the form `setIcon` is called with. */
export function normalizeIconId(id: string): string {
	return id.startsWith(LUCIDE_PREFIX) ? id.slice(LUCIDE_PREFIX.length) : id;
}

/** Structural check: a plausible bare icon id (no spaces, kebab/word chars). */
export function isPlausibleIconId(value: string): boolean {
	return typeof value === "string" && /^[\w-]+$/u.test(value);
}
