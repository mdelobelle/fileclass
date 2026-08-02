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

/**
 * Reads coordinates out of whatever the operator actually pasted.
 *
 * `parseLocation` only accepts the canonical `"lat,lon"`, which is what we store
 * — but nobody types that: they copy a Google or Apple Maps link, or the
 * degree-marked pair a site displays, or a `geo:` URI from a phone. Every one of
 * those used to fill nothing at all, silently.
 *
 * Order matters: a URL is tried before the loose forms, because its path and query
 * are full of numbers that a bare "find two numbers" rule would happily misread.
 */
export function parsePastedLocation(text: string): LatLon | null {
	const coords = extractPastedPair(text);
	return coords && inRange(coords) ? coords : null;
}

/**
 * The same reading, without the range check — so a caller can tell "that isn't a
 * coordinate pair" from "that pair is off the globe", which are different mistakes
 * and deserve different words.
 */
export function extractPastedPair(text: string): LatLon | null {
	if (typeof text !== "string") return null;
	const raw = text.trim();
	if (!raw) return null;

	const canonical = parseLocation(raw);
	if (canonical) return canonical;

	const fromUrl = /^[a-z][\w+.-]*:/iu.test(raw) ? coordsFromUrl(raw) : null;
	if (fromUrl) return fromUrl;

	return coordsFromLoosePair(raw);
}

/** `geo:`, `?ll=`/`?q=`, OpenStreetMap's `mlat`/`mlon`, or an `@lat,lon` path. */
function coordsFromUrl(url: string): LatLon | null {
	const geo = /^geo:(-?[\d.]+),(-?[\d.]+)/iu.exec(url);
	if (geo) return checked(Number(geo[1]), Number(geo[2]));

	let params: URLSearchParams | null = null;
	let hash = "";
	try {
		const parsed = new URL(url);
		params = parsed.searchParams;
		hash = parsed.hash;
	} catch {
		/* not a URL after all — fall through to the path patterns */
	}
	for (const key of ["ll", "q", "query", "center", "sll", "daddr"]) {
		const pair = params?.get(key);
		const coords = pair ? parseLocation(pair) : null;
		if (coords) return coords;
	}
	const mlat = params?.get("mlat");
	const mlon = params?.get("mlon");
	if (mlat && mlon) {
		const coords = checked(Number(mlat), Number(mlon));
		if (coords) return coords;
	}
	// Google's `/@lat,lon,17z`, and OpenStreetMap's `#map=15/lat/lon`.
	const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/u.exec(url);
	if (at) {
		const coords = checked(Number(at[1]), Number(at[2]));
		if (coords) return coords;
	}
	const map = /#map=[\d.]+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/u.exec(hash || url);
	return map ? checked(Number(map[1]), Number(map[2])) : null;
}

/**
 * A pair of numbers separated by a comma, a semicolon or a space, each optionally
 * carrying a degree mark and a hemisphere letter — `48.8584° N, 2.2945° E`. The
 * letter wins over the sign, so `S` and `W` come out negative.
 *
 * Two tokens exactly, and nothing else left over but separators: a sentence that
 * happens to contain numbers is not a coordinate pair.
 */
function coordsFromLoosePair(text: string): LatLon | null {
	// A dot decimal only: allowing "48,8584" would make "1,2,3" a valid pair.
	const token = /(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?/giu;
	const found = [...text.matchAll(token)];
	if (found.length !== 2) return null;
	const leftovers = text.replace(token, " ").replace(/[\s,;°]/gu, "");
	if (leftovers) return null;
	const value = (m: RegExpMatchArray): number => {
		const n = Number(m[1]);
		const hemisphere = (m[2] ?? "").toUpperCase();
		return hemisphere === "S" || hemisphere === "W" ? -Math.abs(n) : n;
	};
	return checked(value(found[0]), value(found[1]));
}

/** A finite pair, whatever its range. */
function checked(lat: number, lon: number): LatLon | null {
	return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
