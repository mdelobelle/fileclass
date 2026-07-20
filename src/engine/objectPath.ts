/*
 * objectPath — parse and mutate nested frontmatter values by path
 * (ARCHITECTURE.md §8). Zero Obsidian imports; fully unit-tested.
 *
 * Path syntax deliberately matches Bases formula traversal (§3.1):
 *   "fields[0].name"       → ["fields", 0, "name"]
 *   'note["a"][0]["b"]'    → ["note", "a", 0, "b"]
 * Dotted segments and bare identifiers are object keys; bracketed integers are
 * array indices; bracketed quoted strings are object keys (arbitrary chars).
 *
 * The mutators operate on the caller's own object (the draft clone in D5) and
 * mutate in place: they never regenerate structure from a schema, so unknown
 * keys are preserved.
 */

/** A single step in a path: an object key (string) or array index (number). */
export type PathSegment = string | number;

/** Either a parsed segment list or the string form accepted by `parsePath`. */
export type Path = string | readonly PathSegment[];

type Container = Record<string, unknown> | unknown[];

function isContainer(v: unknown): v is Container {
	return typeof v === "object" && v !== null;
}

// ---------------------------------------------------------------------------
// Parsing / formatting
// ---------------------------------------------------------------------------

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * Parses a path string into segments.
 * @throws on malformed input (unterminated bracket, empty segment, etc.).
 */
export function parsePath(path: string): PathSegment[] {
	const segments: PathSegment[] = [];
	let i = 0;
	const n = path.length;

	const readIdentifier = (): string => {
		const start = i;
		if (i >= n || !IDENT_START.test(path[i])) {
			throw new Error(`Invalid path "${path}": expected identifier at ${i}`);
		}
		i++;
		while (i < n && IDENT_PART.test(path[i])) i++;
		return path.slice(start, i);
	};

	const readBracket = (): PathSegment => {
		// path[i] === "["
		i++; // consume "["
		if (i >= n) throw new Error(`Invalid path "${path}": unterminated "["`);
		const ch = path[i];
		if (ch === '"' || ch === "'") {
			// Quoted string key: supports \" / \' / \\ escapes.
			const quote = ch;
			i++;
			let key = "";
			while (i < n && path[i] !== quote) {
				if (path[i] === "\\" && i + 1 < n) {
					key += path[i + 1];
					i += 2;
				} else {
					key += path[i];
					i++;
				}
			}
			if (i >= n) throw new Error(`Invalid path "${path}": unterminated string`);
			i++; // consume closing quote
			if (path[i] !== "]") {
				throw new Error(`Invalid path "${path}": expected "]" at ${i}`);
			}
			i++; // consume "]"
			return key;
		}
		// Integer index.
		const start = i;
		if (path[i] === "-") i++;
		while (i < n && /[0-9]/.test(path[i])) i++;
		const raw = path.slice(start, i);
		if (raw === "" || raw === "-" || path[i] !== "]") {
			throw new Error(`Invalid path "${path}": expected integer index at ${start}`);
		}
		i++; // consume "]"
		return Number.parseInt(raw, 10);
	};

	// First segment must be a bare identifier (frontmatter top-level key).
	segments.push(readIdentifier());

	while (i < n) {
		const ch = path[i];
		if (ch === ".") {
			i++;
			segments.push(readIdentifier());
		} else if (ch === "[") {
			segments.push(readBracket());
		} else {
			throw new Error(`Invalid path "${path}": unexpected "${ch}" at ${i}`);
		}
	}
	return segments;
}

/** Renders segments back to canonical string form (inverse of `parsePath`). */
export function formatPath(segments: readonly PathSegment[]): string {
	let out = "";
	segments.forEach((seg, idx) => {
		if (typeof seg === "number") {
			out += `[${seg}]`;
		} else if (idx === 0) {
			out += seg;
		} else if (IDENT_START.test(seg) && [...seg].every((c) => IDENT_PART.test(c))) {
			out += `.${seg}`;
		} else {
			out += `[${JSON.stringify(seg)}]`;
		}
	});
	return out;
}

function toSegments(path: Path): PathSegment[] {
	return typeof path === "string" ? parsePath(path) : [...path];
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

/** Returns the value at `path`, or `undefined` if any step is missing. */
export function getAtPath(root: unknown, path: Path): unknown {
	const segments = toSegments(path);
	let current: unknown = root;
	for (const seg of segments) {
		if (!isContainer(current)) return undefined;
		if (typeof seg === "number") {
			if (!Array.isArray(current)) return undefined;
			current = current[seg];
		} else {
			if (Array.isArray(current)) return undefined;
			current = current[seg];
		}
	}
	return current;
}

/**
 * Sets `value` at `path`, creating intermediate containers as needed
 * (arrays when the next segment is a number, objects otherwise). Mutates and
 * returns `root`.
 * @throws if an existing intermediate value conflicts with the segment kind
 *         (e.g. a primitive where an object/array is required).
 */
export function setAtPath<T>(root: T, path: Path, value: unknown): T {
	const segments = toSegments(path);
	if (segments.length === 0) throw new Error("setAtPath: empty path");
	if (!isContainer(root)) throw new Error("setAtPath: root is not a container");

	let current: Container = root;
	for (let k = 0; k < segments.length - 1; k++) {
		const seg = segments[k];
		const next = segments[k + 1];
		const child = readChild(current, seg);
		if (child === undefined || !isContainer(child)) {
			if (child !== undefined) {
				throw new Error(
					`setAtPath: cannot descend into non-container at "${describe(segments, k)}"`
				);
			}
			const created: Container = typeof next === "number" ? [] : {};
			writeChild(current, seg, created);
			current = created;
		} else {
			assertSegmentMatchesContainer(child, next, segments, k + 1);
			current = child;
		}
	}
	writeChild(current, segments[segments.length - 1], value);
	return root;
}

/**
 * Inserts `value` into the array at `path`. Creates the array if missing.
 * @param index insertion position; defaults to appending at the end. Out-of-range
 *              indices are clamped like `Array.prototype.splice`.
 * @throws if a value exists at `path` and is not an array.
 */
export function insertAtPath<T>(root: T, path: Path, value: unknown, index?: number): T {
	const segments = toSegments(path);
	const existing = getAtPath(root, segments);
	let arr: unknown[];
	if (existing === undefined) {
		arr = [];
		setAtPath(root, segments, arr);
	} else if (Array.isArray(existing)) {
		arr = existing;
	} else {
		throw new Error(`insertAtPath: value at "${formatPath(segments)}" is not an array`);
	}
	const at = index === undefined ? arr.length : index;
	arr.splice(at, 0, value);
	return root;
}

/**
 * Removes the value at `path`: splices it out when the parent is an array,
 * deletes the key when the parent is an object. No-op if the parent is missing.
 * Mutates and returns `root`.
 */
export function removeAtPath<T>(root: T, path: Path): T {
	const segments = toSegments(path);
	if (segments.length === 0) throw new Error("removeAtPath: empty path");
	const parent = getAtPath(root, segments.slice(0, -1));
	const last = segments[segments.length - 1];
	if (!isContainer(parent)) return root;
	if (typeof last === "number") {
		if (Array.isArray(parent) && last >= 0 && last < parent.length) {
			parent.splice(last, 1);
		}
	} else if (!Array.isArray(parent)) {
		delete parent[last];
	}
	return root;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readChild(container: Container, seg: PathSegment): unknown {
	if (typeof seg === "number") {
		return Array.isArray(container) ? container[seg] : undefined;
	}
	return Array.isArray(container) ? undefined : container[seg];
}

function writeChild(container: Container, seg: PathSegment, value: unknown): void {
	if (typeof seg === "number") {
		if (!Array.isArray(container)) {
			throw new Error(`objectPath: numeric segment on a non-array`);
		}
		container[seg] = value;
	} else {
		if (Array.isArray(container)) {
			throw new Error(`objectPath: string key on an array`);
		}
		container[seg] = value;
	}
}

function assertSegmentMatchesContainer(
	child: Container,
	nextSeg: PathSegment,
	segments: readonly PathSegment[],
	nextIdx: number
): void {
	const needsArray = typeof nextSeg === "number";
	if (needsArray && !Array.isArray(child)) {
		throw new Error(`setAtPath: expected array at "${describe(segments, nextIdx)}"`);
	}
	if (!needsArray && Array.isArray(child)) {
		throw new Error(`setAtPath: expected object at "${describe(segments, nextIdx)}"`);
	}
}

function describe(segments: readonly PathSegment[], upto: number): string {
	return formatPath(segments.slice(0, upto + 1));
}
