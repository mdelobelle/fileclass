/*
 * What a grouped table shows above each run of rows (pure, ARCHITECTURE.md §11).
 *
 * Grouping is not ours to compute: the Bases dataset carries a `groupedData` getter that reads the
 * view's own `groupBy` and returns the rows already grouped and ordered — measured on 1.11.7, the
 * native `table` and a plugin view are handed exactly the same groups for the same view config. So
 * the only decisions left here are the two a renderer has to make: whether to show headings at all,
 * and what a heading says when the value is missing.
 */

/** One group as Bases builds it (structural, like the rest of the adapter). */
export interface BasesGroupLike<E> {
	entries: E[];
	key?: { toString(): string } | null;
	hasKey?: () => boolean;
}

/** A group ready to render: `label` is null when this run of rows carries no heading. */
export interface RenderedGroup<E> {
	label: string | null;
	entries: E[];
}

/** What a heading shows when the property is empty on every note of the group. */
export const NO_GROUP_VALUE = "None";

/**
 * Turns the dataset's groups into what to draw.
 *
 * An ungrouped view is not a special case in Bases — it is one group holding everything, with no
 * key — so it is not one here either: that shape simply yields a single run with no heading, and
 * the renderer keeps one code path.
 */
export function renderedGroups<E>(groups: readonly BasesGroupLike<E>[] | undefined, entries: readonly E[]): RenderedGroup<E>[] {
	if (!groups?.length) return [{ label: null, entries: [...entries] }];
	const keyed = groups.some((g) => g.hasKey?.() === true);
	return groups.map((g) => ({
		// A single unkeyed group is the ungrouped view; a *missing* value among real ones is a
		// group of its own, and saying so is the point — those are the notes with nothing there.
		label: keyed ? (g.hasKey?.() ? String(g.key ?? "") : NO_GROUP_VALUE) : null,
		entries: [...g.entries],
	}));
}

/** The property a view groups on, as an id `columnLabel` can name (`""` when it groups on nothing). */
export function groupProperty(config: unknown): string {
	const groupBy = (config as { groupBy?: { property?: unknown } } | undefined)?.groupBy;
	const property = groupBy?.property;
	// Bases stores it as a property object whose `toString()` is the id (`note.genre`), and as a
	// plain string in a hand-written base — both reach here, so neither is assumed.
	if (typeof property === "string") return property;
	if (property && typeof (property as { toString(): string }).toString === "function")
		return String(property);
	return "";
}
