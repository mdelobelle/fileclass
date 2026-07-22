/*
 * Geographic coordinate helpers for the Location field (#31, ARCHITECTURE §7.1).
 * Pure, zero-dependency (no Obsidian). A Location is stored as a `"lat,lon"`
 * scalar (the core Bases Map view / Map View plugin convention), with latitude
 * in [-90, 90] and longitude in [-180, 180].
 */

export interface LatLon {
	lat: number;
	lon: number;
}

/** Parses a `"lat,lon"` string into finite numbers, or null if malformed. */
export function parseLocation(str: string): LatLon | null {
	if (typeof str !== "string") return null;
	const parts = str.split(",");
	if (parts.length !== 2) return null;
	const a = parts[0].trim();
	const b = parts[1].trim();
	if (a === "" || b === "") return null;
	const lat = Number(a);
	const lon = Number(b);
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	return { lat, lon };
}

/** True when latitude ∈ [-90, 90] and longitude ∈ [-180, 180]. */
export function inRange(coords: LatLon): boolean {
	return coords.lat >= -90 && coords.lat <= 90 && coords.lon >= -180 && coords.lon <= 180;
}

/** True when `str` is a well-formed, in-range `"lat,lon"` scalar. */
export function isValidLocation(str: string): boolean {
	const coords = parseLocation(str);
	return coords !== null && inRange(coords);
}

/** The canonical stored form: `"lat,lon"`, no spaces. */
export function formatLocation(lat: number, lon: number): string {
	return `${lat},${lon}`;
}

/** An OpenStreetMap URL for the coordinates, or null when they're invalid. */
export function mapUrl(str: string): string | null {
	const coords = parseLocation(str);
	if (!coords || !inRange(coords)) return null;
	const { lat, lon } = coords;
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
}
