/*
 * A class note's `relatedViews` row, read as relations rather than as JSON (pure).
 *
 * Same problem as `fields`, and the same answer: a list of objects has no editor in Obsidian, so
 * the Properties panel printed the raw value in the warning colour it keeps for things nobody can
 * interpret — on the note where that value is the subject. What the reader wants from that row is
 * which field reaches which view, and to get there.
 */
import { toRelatedViews } from "./fileClass";
import { parseViewRef } from "../views/reverseView";

export interface RelatedViewLine {
	/** The link field this view shows the other end of. */
	field: string;
	/** How the target reads: `Books › A's Bs`, or the raw ref when it does not parse. */
	label: string;
	/** Where to go, when there is somewhere to go. */
	target: { path: string; viewName: string } | null;
	/** The base is named but not in the vault — or the ref is malformed. */
	missing: boolean;
}

/** `Bases/Books.base` → `Books`: the file, without the folders or the extension. */
function baseLabel(path: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	return file.endsWith(".base") ? file.slice(0, -".base".length) : file;
}

/**
 * One line per declared relation, in declaration order.
 *
 * `exists` is passed in rather than looked up, both to keep this pure and because a missing base
 * is worth saying out loud: a renamed or deleted base leaves a declaration pointing at nothing,
 * and this row is where that shows first. Nothing is repaired here — that decision was made when
 * renames were handled: detect and say so, never rewrite somebody's schema behind their back.
 */
export function relatedViewLines(value: unknown, exists: (path: string) => boolean): RelatedViewLine[] {
	return toRelatedViews(value).map((entry) => {
		const ref = parseViewRef(entry.view);
		if (!ref) return { field: entry.field, label: entry.view, target: null, missing: true };
		return {
			field: entry.field,
			label: `${baseLabel(ref.path)} › ${ref.viewName}`,
			target: ref,
			missing: !exists(ref.path),
		};
	});
}
