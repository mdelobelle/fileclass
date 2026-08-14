/*
 * A class's own order over its resolved fields — inherited ones included (pure).
 *
 * Inheritance gives a **default**: the root of the chain first, then each class down to this one
 * (see inheritance.ts). This module lets a class override that default freely, mixing what it
 * inherits with what it declares: `Book` may want `Media`'s `title`, then its own `author`, then
 * `Media`'s `year`. The order is a datum of `Book` alone — `Media` is not touched, and `Comic`,
 * which extends the same class, keeps its own.
 *
 * The order is stored as `fieldsOrder` on the class note: keys qualified by level, `title`,
 * `editions`, `editions.year`. Names rather than ids, because a name at its level is already what
 * identifies a field across the chain (inheritance de-duplicates on exactly that, so an override is
 * the same key as the field it overrides), because ids are only unique **within** a class — two
 * classes in one chain can hold the same id — and because a `fieldsOrder` you read in the
 * frontmatter should say something.
 */
import { Field, PATH_SEPARATOR, isRootField, pathFieldNames } from "./field";

/** `editions.year` — the field's name, behind the names of the groups holding it. */
export function fieldOrderKey(fields: readonly Field[], field: Field): string {
	return [...pathFieldNames(fields, field.path), field.name].join(".");
}

/** Every field's key, in the order they currently come in: what a class writes to freeze it. */
export function fieldOrderKeys(fields: readonly Field[]): string[] {
	return fields.map((f) => fieldOrderKey(fields, f));
}

/**
 * Reorders a resolved field set by a class's `fieldsOrder`.
 *
 * Three rules, all of them about a declaration that no longer matches the fields:
 *
 * - a key naming a field that no longer resolves (removed upstream, or excluded here) is ignored;
 * - a field the order does not name is placed **right after the field it follows by default**, not
 *   at the end: when an ancestor gains a field, it appears where the ancestor put it rather than
 *   being exiled below this class's own;
 * - levels are ordered independently — a child moves among its siblings — and the result keeps each
 *   group's children directly behind it.
 */
export function applyFieldOrder(fields: readonly Field[], order: readonly string[]): Field[] {
	if (!order.length) return [...fields];
	const rank = new Map<string, number>();
	order.forEach((key, i) => {
		if (!rank.has(key)) rank.set(key, i);
	});

	// Fields by level, in the default order. `path` is the chain of parent ids, so it is the level.
	const levels = new Map<string, Field[]>();
	for (const field of fields) {
		const at = levels.get(field.path);
		if (at) at.push(field);
		else levels.set(field.path, [field]);
	}

	for (const [path, siblings] of levels) {
		levels.set(path, sortLevel(fields, siblings, rank));
	}

	// Emitted level by level so a group's children stay behind it, whatever moved where.
	const out: Field[] = [];
	const emit = (path: string): void => {
		for (const field of levels.get(path) ?? []) {
			out.push(field);
			const childPath = field.path ? `${field.path}${PATH_SEPARATOR}${field.id}` : field.id;
			if (levels.has(childPath)) emit(childPath);
		}
	};
	emit("");
	// A child whose parent is not in the set would otherwise be dropped: keep it, at the end,
	// rather than lose a field to a `path` nothing resolves.
	for (const field of fields) if (!out.includes(field)) out.push(field);
	return out;
}

/**
 * One level, sorted by the stored order.
 *
 * A field the order does not name borrows the rank of the last named field before it, and is kept
 * behind it by a tiebreak — so an unnamed field sits where it sat, relative to the ones that are
 * named, instead of falling to the end. One before any named field keeps the head of the level.
 */
function sortLevel(all: readonly Field[], siblings: readonly Field[], rank: Map<string, number>): Field[] {
	const weighted = siblings.map((field, index) => ({ field, index, rank: 0, tie: 0 }));
	let lastRank = -1;
	let tie = 0;
	for (const entry of weighted) {
		const known = rank.get(fieldOrderKey(all, entry.field));
		if (known !== undefined) {
			lastRank = known;
			tie = 0;
			entry.rank = known;
		} else {
			entry.rank = lastRank;
			entry.tie = ++tie;
		}
	}
	return weighted
		.sort((a, b) => a.rank - b.rank || a.tie - b.tie || a.index - b.index)
		.map((e) => e.field);
}

/**
 * The order that results from moving one field among its siblings (`dir` = -1 up, +1 down).
 *
 * Returns the **whole** key list, every level of it: the stored order is rewritten in full on every
 * move, so a class never ends up with a partial declaration whose gaps are filled by rules nobody
 * remembers. Returns null when there is nowhere to move — the ends of a level.
 */
export function movedFieldOrder(fields: readonly Field[], key: string, dir: -1 | 1): string[] | null {
	const target = fields.find((f) => fieldOrderKey(fields, f) === key);
	if (!target) return null;
	const siblings = fields.filter((f) => f.path === target.path);
	const at = siblings.indexOf(target);
	const to = at + dir;
	if (at < 0 || to < 0 || to >= siblings.length) return null;
	const reordered = [...siblings];
	[reordered[at], reordered[to]] = [reordered[to], reordered[at]];

	// Rebuilt from the field set with this level replaced, so the keys of every other level keep
	// the order they already had.
	const swapped = new Map<string, Field[]>();
	swapped.set(target.path, reordered);
	const out: string[] = [];
	const emit = (path: string): void => {
		const level = swapped.get(path) ?? fields.filter((f) => f.path === path);
		for (const field of level) {
			out.push(fieldOrderKey(fields, field));
			const childPath = field.path ? `${field.path}${PATH_SEPARATOR}${field.id}` : field.id;
			if (fields.some((f) => f.path === childPath)) emit(childPath);
		}
	};
	emit("");
	return out;
}

/**
 * The same order with one field renamed — `null` when the order does not name it.
 *
 * A stored order names fields by name, so a rename would otherwise silently drop the field back to
 * its default position: the entry stops matching anything, and rule two ignores it. Children come
 * along, since their keys carry the group's name in front of them.
 */
export function renamedFieldOrder(
	order: readonly string[],
	fromKey: string,
	toKey: string
): string[] | null {
	const prefix = `${fromKey}.`;
	let touched = false;
	const next = order.map((key) => {
		if (key === fromKey) {
			touched = true;
			return toKey;
		}
		if (key.startsWith(prefix)) {
			touched = true;
			return `${toKey}.${key.slice(prefix.length)}`;
		}
		return key;
	});
	return touched ? next : null;
}

/** Whether a field comes from an ancestor rather than from this class. */
export function isInherited(field: Field, className: string): boolean {
	return field.fileClassName !== className;
}

/** Root fields only, for the surfaces that list one level (the editor's top screen). */
export function rootFieldsInOrder(fields: readonly Field[]): Field[] {
	return fields.filter(isRootField);
}
