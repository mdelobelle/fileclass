/*
 * The schema canvas (#149): a `.canvas` that mirrors the vault's fileClasses — inheritance,
 * the bases and canvases their fields depend on, and what each class claims.
 *
 * Pure: no `obsidian` import, so every rule here is unit-tested. The caller reads the classes,
 * writes the file, and handles the open-view dance.
 *
 * **The hard part is not layout.** Computing positions on every sync would destroy the
 * arrangement its reader made, which is worse than no diagram at all — so this module never
 * moves a node it recognises. It derives *what* should be there, matches that against the file
 * on disk by **deterministic id**, keeps the geometry of everything already placed, and finds a
 * free slot only for what is new. That is the same promise `mirrorBaseView` makes about a view's
 * filters and `processFrontMatter` about key order.
 *
 * Ids are readable on purpose (`fileclass:Book`, `base:Books.base`) and verified in the app:
 * Obsidian renders them and preserves them through its own saves. Renaming a class therefore
 * yields a new node rather than a renamed one, which is the honest outcome — nothing links the
 * two.
 */

/** A class as this module needs it: its own options and the fields it declares. */
export interface SchemaClass {
	name: string;
	/** Vault path of the class note, for the `file` node. */
	path: string;
	extends?: string;
	excludes: string[];
	mapWithTag: boolean;
	tagNames: string[];
	filesPaths: string[];
	bookmarksGroups: string[];
	/** Bases feeding a field of this class: values lists and link candidates alike. */
	baseDeps: { path: string; kind: "values" | "candidates" }[];
	/** Canvases feeding a Canvas-family field. */
	canvasDeps: string[];
	/**
	 * How many frontmatter keys the class note carries.
	 *
	 * A canvas `file` node renders the note's Properties block, and a fixed height cut it off
	 * halfway: a class with `icon`, `fields`, `extends`, `excludes`, `tagNames` and a base to
	 * mirror into shows six rows, and 150 units showed one. The node is sized to hold them.
	 */
	propertyCount?: number;
}

export interface CanvasNode {
	id: string;
	type: "file" | "text";
	file?: string;
	text?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide: "top" | "right" | "bottom" | "left";
	toNode: string;
	toSide: "top" | "right" | "bottom" | "left";
	label?: string;
	color?: string;
}

export interface CanvasDoc {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

/**
 * What the canvas should contain, before anything is placed.
 *
 * `anchor` is the node a newcomer belongs beside — a claim card under its class, a base to the
 * right of the class that needs it. It only seeds the search for a free slot: a first generation
 * then reads as a diagram instead of a grid, and nothing existing is ever moved to achieve it.
 */
interface Desired {
	nodes: (Omit<CanvasNode, "x" | "y" | "width" | "height"> &
		Partial<CanvasNode> & {
			anchor?: { id: string; side: "right" | "below" };
			/** A column/row this node would like, when nothing anchors it. */
			hint?: { col: number; row: number };
		})[];
	edges: CanvasEdge[];
}

const NODE_W = 320;
/** A file node previews the note's title and properties; 100 clipped both. */
const NODE_H = 150;
/** Title, the "Properties" heading, one row per key, and the box's own padding. */
const classHeight = (keys: number | undefined): number =>
	keys === undefined ? NODE_H : Math.max(NODE_H, 110 + keys * 34);
const CARD_W = 300;
/** A card is as tall as its lines: a title, one per entry, and room for the box's padding. */
const cardHeight = (lines: number): number => 70 + Math.max(1, lines) * 30;
/** Colours are Obsidian's canvas palette (1 red … 6 purple), quoted as it stores them. */
const COLOUR = { base: "5", canvas: "4", claim: "6", inactive: "1" } as const;
/** How many claims a card lists before it says how many more there are. */
const CARD_LIMIT = 6;
/** How many excluded field names an `extends` edge names before the same. */
const LABEL_LIMIT = 3;

export const nodeIdFor = {
	fileClass: (name: string): string => `fileclass:${name}`,
	base: (path: string): string => `base:${path}`,
	canvas: (path: string): string => `canvas:${path}`,
	claim: (name: string, kind: ClaimKind): string => `binding:${name}:${kind}`,
};

export type ClaimKind = "paths" | "tags" | "bookmarks";

/**
 * A tag that can never bind, and why.
 *
 * The index skips any tag containing a space — `tagNames` entries and the implicit
 * `mapWithTag` one alike — so a class named "Media Item" with `mapWithTag: true` claims nothing
 * at all, silently. The canvas is the first surface that can say so, which is the difference
 * between a diagram and a diagnostic.
 */
export function inactiveTagReason(tag: string): string | null {
	if (!tag.trim()) return "empty";
	return tag.includes(" ") ? "a tag cannot contain a space" : null;
}

/** The claims of one kind, as the card lists them: text plus whether any of it is dead. */
export function claimCardText(kind: ClaimKind, entries: string[]): string {
	const title = { paths: "Files paths", tags: "Tags", bookmarks: "Bookmark groups" }[kind];
	if (!entries.length) return "";
	const shown = entries.slice(0, CARD_LIMIT).map((e) => {
		const dead = kind === "tags" ? inactiveTagReason(e) : null;
		return dead ? `- ~~${e}~~ (${dead})` : `- ${e}`;
	});
	const rest = entries.length - shown.length;
	if (rest > 0) shown.push(`- …and ${rest} more`);
	return [`**${title}**`, ...shown].join("\n");
}

/** The tags a class claims, the implicit `mapWithTag` one included. */
export function claimedTags(cls: SchemaClass): string[] {
	return cls.mapWithTag ? [cls.name, ...cls.tagNames] : [...cls.tagNames];
}

function claimsOf(cls: SchemaClass): { kind: ClaimKind; entries: string[] }[] {
	return [
		{ kind: "paths" as ClaimKind, entries: cls.filesPaths },
		{ kind: "tags" as ClaimKind, entries: claimedTags(cls) },
		{ kind: "bookmarks" as ClaimKind, entries: cls.bookmarksGroups },
	].filter((c) => c.entries.length > 0);
}

/** `excludes` on an inheritance edge, capped so a class dropping a dozen fields stays readable. */
export function extendsLabel(excludes: string[]): string | undefined {
	if (!excludes.length) return undefined;
	const shown = excludes.slice(0, LABEL_LIMIT);
	const rest = excludes.length - shown.length;
	return `− ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`;
}

/**
 * Everything the canvas should show for `classes`, with ids but no geometry.
 *
 * An `extends` pointing at a class the vault does not have produces **no edge**: the canvas
 * shows what is, not what was meant. A base or canvas feeding several classes is one node, so
 * the shared dependency reads as shared.
 */
export function desiredSchemaCanvas(classes: SchemaClass[]): Desired {
	const nodes: Desired["nodes"] = [];
	const edges: CanvasEdge[] = [];
	const known = new Set(classes.map((c) => c.name));
	const seen = new Set<string>();
	const add = (node: Desired["nodes"][number]): void => {
		if (seen.has(node.id)) return;
		seen.add(node.id);
		nodes.push(node);
	};

	const grid = inheritanceGrid(classes);
	for (const cls of classes) {
		add({
			id: nodeIdFor.fileClass(cls.name),
			type: "file",
			file: cls.path,
			height: classHeight(cls.propertyCount),
			hint: grid.get(cls.name),
		});
	}
	// Bases and canvases live in a column of their own, to the right of the whole tree: they are
	// shared between classes, and threading them between the classes is what made the first
	// draft one unreadable row.
	const depColumn = Math.max(0, ...[...grid.values()].map((g) => g.col)) + 2;
	let depRow = 0;
	for (const cls of classes) {
		if (cls.extends && known.has(cls.extends)) {
			edges.push({
				id: `edge:${cls.name}:extends`,
				fromNode: nodeIdFor.fileClass(cls.name),
				fromSide: "top",
				toNode: nodeIdFor.fileClass(cls.extends),
				toSide: "bottom",
				label: extendsLabel(cls.excludes),
			});
		}
		for (const dep of cls.baseDeps) {
			if (!seen.has(nodeIdFor.base(dep.path))) {
				add({
					id: nodeIdFor.base(dep.path),
					type: "file",
					file: dep.path,
					color: COLOUR.base,
					hint: { col: depColumn, row: depRow++ },
				});
			}
			edges.push({
				id: `edge:${cls.name}:base:${dep.path}:${dep.kind}`,
				fromNode: nodeIdFor.fileClass(cls.name),
				fromSide: "right",
				toNode: nodeIdFor.base(dep.path),
				toSide: "left",
				label: dep.kind === "values" ? "values" : "candidates",
				color: COLOUR.base,
			});
		}
		for (const path of cls.canvasDeps) {
			if (!seen.has(nodeIdFor.canvas(path))) {
				add({
					id: nodeIdFor.canvas(path),
					type: "file",
					file: path,
					color: COLOUR.canvas,
					hint: { col: depColumn, row: depRow++ },
				});
			}
			edges.push({
				id: `edge:${cls.name}:canvas:${path}`,
				fromNode: nodeIdFor.fileClass(cls.name),
				fromSide: "right",
				toNode: nodeIdFor.canvas(path),
				toSide: "left",
				label: "canvas",
				color: COLOUR.canvas,
			});
		}
		for (const { kind, entries } of claimsOf(cls)) {
			const dead = kind === "tags" && entries.every((e) => inactiveTagReason(e));
			add({
				id: nodeIdFor.claim(cls.name, kind),
				type: "text",
				text: claimCardText(kind, entries),
				color: dead ? COLOUR.inactive : COLOUR.claim,
				width: CARD_W,
				height: cardHeight(claimCardText(kind, entries).split("\n").length - 1),
				anchor: { id: nodeIdFor.fileClass(cls.name), side: "below" },
			});
			edges.push({
				id: `edge:${cls.name}:claim:${kind}`,
				fromNode: nodeIdFor.claim(cls.name, kind),
				fromSide: "top",
				toNode: nodeIdFor.fileClass(cls.name),
				toSide: "bottom",
				color: dead ? COLOUR.inactive : COLOUR.claim,
			});
		}
	}
	return { nodes, edges };
}

/** Column and row width, in canvas units. A row leaves space for a class's cards below it. */
const COL_STEP = 400;
const ROW_STEP = 420;

/**
 * Where each class would like to sit: **inheritance down, families side by side**.
 *
 * Depth-first over the roots, one column per class in that order and one row per level, so a
 * parent sits above its first child and siblings do not interleave. This is the only layout
 * decision in the module, and it applies to a **first generation** — a bulk insert of everything
 * at once, where the alternative was measured and unreadable: eleven classes in one 5320px row
 * with the inheritance edges looping over the top of it.
 *
 * A cycle in `extends` (a vault can hold one) is walked once and stops: no infinite descent.
 */
function inheritanceGrid(classes: SchemaClass[]): Map<string, { col: number; row: number }> {
	const byName = new Map(classes.map((c) => [c.name, c]));
	const childrenOf = new Map<string, string[]>();
	for (const cls of classes) {
		const parent = cls.extends && byName.has(cls.extends) ? cls.extends : "";
		if (parent === cls.name) continue; // a class extending itself is not a parent
		const list = childrenOf.get(parent) ?? [];
		list.push(cls.name);
		childrenOf.set(parent, list);
	}
	const grid = new Map<string, { col: number; row: number }>();
	// A class with no parent and no children is not part of any chain: stacking those on the
	// left keeps the top row from spreading — measured on the demo vault, six of them across
	// the top pushed the dependency column 5000 units away from the tree it belongs to.
	const roots = childrenOf.get("") ?? [];
	const lonely = roots.filter((name) => !(childrenOf.get(name) ?? []).length);
	const families = roots.filter((name) => (childrenOf.get(name) ?? []).length > 0);
	lonely.forEach((name, i) => grid.set(name, { col: 0, row: i }));

	let col = lonely.length ? 1 : 0;
	const walk = (name: string, row: number): void => {
		if (grid.has(name)) return;
		grid.set(name, { col: col++, row });
		for (const child of childrenOf.get(name) ?? []) walk(child, row + 1);
	};
	for (const root of families) walk(root, 0);
	// Anything left is inside a cycle: give it a row of its own rather than dropping it.
	for (const cls of classes) if (!grid.has(cls.name)) grid.set(cls.name, { col: col++, row: 0 });
	return grid;
}

/** Does `a` overlap `b`, with a gap that keeps the diagram breathable? */
function overlaps(a: CanvasNode, b: CanvasNode, gap = 40): boolean {
	return (
		a.x < b.x + b.width + gap &&
		a.x + a.width + gap > b.x &&
		a.y < b.y + b.height + gap &&
		a.y + a.height + gap > b.y
	);
}

/**
 * A free slot for a node nobody placed yet: left to right, top to bottom, first gap wins.
 *
 * Not a layout algorithm — deliberately. The reader arranges the canvas; this only has to put a
 * newcomer somewhere visible and out of the way, and be predictable enough that two syncs in a
 * row do not shuffle anything.
 */
export function freeSlot(
	placed: CanvasNode[],
	width: number,
	height: number,
	from: { x: number; y: number } = { x: 0, y: 0 }
): { x: number; y: number } {
	const stepX = width + 60;
	const stepY = height + 60;
	for (let row = 0; row < 200; row++) {
		for (let col = 0; col < 12; col++) {
			const candidate = { id: "", type: "text" as const, x: from.x + col * stepX, y: from.y + row * stepY, width, height };
			if (!placed.some((p) => overlaps(candidate, p))) return { x: candidate.x, y: candidate.y };
		}
	}
	// 2400 slots taken is not a diagram any more; put it below everything rather than fail.
	const lowest = placed.reduce((m, p) => Math.max(m, p.y + p.height), 0);
	return { x: 0, y: lowest + 60 };
}

/**
 * Merges what should be there into what is there.
 *
 * The contract, in order of importance:
 *  1. **a node that already exists keeps its geometry** — x, y, width, height, colour. Even a
 *     claim card, whose *text* is regenerated: someone who widened a card should not find it
 *     shrunk;
 *  2. nodes the reader added themselves are kept untouched — this file is theirs too;
 *  3. nodes this module owns and no longer wants are dropped, with their edges;
 *  4. new nodes get a free slot.
 *
 * Returns the merged document and what changed, so a caller can offer a sync only when there is
 * something to sync.
 */
export function reconcileSchemaCanvas(
	existing: CanvasDoc | null,
	desired: Desired
): { doc: CanvasDoc; added: string[]; removed: string[]; updated: string[] } {
	const before = existing ?? { nodes: [], edges: [] };
	const byId = new Map(before.nodes.map((n) => [n.id, n]));
	const wanted = new Set(desired.nodes.map((n) => n.id));
	const ours = (id: string): boolean =>
		id.startsWith("fileclass:") || id.startsWith("base:") || id.startsWith("canvas:") || id.startsWith("binding:");

	// Foreign nodes stay, and are part of the collision map from the start.
	const kept = before.nodes.filter((n) => !ours(n.id) || wanted.has(n.id));
	const removed = before.nodes.filter((n) => ours(n.id) && !wanted.has(n.id)).map((n) => n.id);
	const placed = [...kept];
	/** Anchors resolve against what is already placed, this run's newcomers included. */
	const placedById = new Map(placed.map((n) => [n.id, n]));
	const nodes: CanvasNode[] = [];
	const added: string[] = [];
	const updated: string[] = [];

	for (const node of desired.nodes) {
		const previous = byId.get(node.id);
		const width = previous?.width ?? node.width ?? NODE_W;
		const height = previous?.height ?? node.height ?? NODE_H;
		if (previous) {
			placedById.set(previous.id, previous);
			const merged: CanvasNode = {
				...previous,
				type: node.type,
				file: node.file,
				text: node.text,
				// Geometry and colour are the reader's once the node exists.
				x: previous.x,
				y: previous.y,
				width,
				height,
			};
			if (previous.color !== undefined) merged.color = previous.color;
			else if (node.color !== undefined) merged.color = node.color;
			if (node.type === "file") delete merged.text;
			if (node.type === "text") delete merged.file;
			if (JSON.stringify(merged) !== JSON.stringify(previous)) updated.push(node.id);
			nodes.push(merged);
		} else {
			const anchored = node.anchor ? placedById.get(node.anchor.id) : undefined;
			const from = anchored
				? node.anchor?.side === "right"
					? { x: anchored.x + anchored.width + 60, y: anchored.y }
					: { x: anchored.x, y: anchored.y + anchored.height + 60 }
				: node.hint
					? { x: node.hint.col * COL_STEP, y: node.hint.row * ROW_STEP }
					: { x: 0, y: 0 };
			const slot = freeSlot(placed, width, height, from);
			const { anchor: _anchor, hint: _hint, ...rest } = node;
			const fresh: CanvasNode = { ...rest, ...slot, width, height } as CanvasNode;
			nodes.push(fresh);
			placed.push(fresh);
			placedById.set(fresh.id, fresh);
			added.push(node.id);
		}
	}

	// Foreign nodes are appended, so the file keeps them without our nodes' order depending on them.
	const foreign = before.nodes.filter((n) => !ours(n.id));
	const liveIds = new Set([...nodes.map((n) => n.id), ...foreign.map((n) => n.id)]);
	const foreignEdges = before.edges.filter(
		(e) => !e.id.startsWith("edge:") && liveIds.has(e.fromNode) && liveIds.has(e.toNode)
	);

	return {
		doc: { nodes: [...nodes, ...foreign], edges: [...desired.edges, ...foreignEdges] },
		added,
		removed,
		updated,
	};
}
