/*
 * Pure canvas-graph traversal for the Canvas field family (ARCHITECTURE.md
 * §9.1). No Obsidian, no Dataview — operates on a parsed `.canvas` document so
 * it is fully unit-testable. The engine (canvasEngine.ts) reads/writes files and
 * calls these to derive each field's value.
 *
 * Ported from Metadata Menu's updateCanvas.ts, minus the optional DataviewJS
 * file filter (excluded by D1).
 */

/** A node in a `.canvas` file (structural subset of obsidian/canvas). */
export interface CanvasNode {
	id: string;
	type: string; // "file" | "group" | "text" | "link"
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	/** File nodes: the linked note path (and optional subpath). */
	file?: string;
	subpath?: string;
	/** Group nodes: the group label. */
	label?: string;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: string;
	toSide?: string;
	color?: string;
	label?: string;
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export type CanvasDirection = "incoming" | "outgoing" | "bothsides";

/** Filters for edge/node matching (all optional; empty = match all). */
export interface CanvasLinkOptions {
	direction: CanvasDirection;
	nodeColors?: string[];
	edgeColors?: string[];
	edgeFromSides?: string[];
	edgeToSides?: string[];
	edgeLabels?: string[];
	/** When set, keep only target files whose path is in this set (AND). */
	matchingFiles?: Set<string>;
}

export interface CanvasGroupOptions {
	groupColors?: string[];
	groupLabels?: string[];
}

/** A resolved file target (note path plus optional heading/block subpath). */
export interface CanvasFileRef {
	file: string;
	subpath?: string;
}

/** Parses `.canvas` JSON, tolerating malformed content (→ empty graph). */
export function parseCanvas(raw: string): CanvasData {
	try {
		const data = JSON.parse(raw) as Partial<CanvasData>;
		return { nodes: data.nodes ?? [], edges: data.edges ?? [] };
	} catch {
		return { nodes: [], edges: [] };
	}
}

/** Colors use "0" to mean "no color"; empty filter matches everything. */
function colorMatch(color: string | undefined, filter?: string[]): boolean {
	if (!filter || filter.length === 0) return true;
	return color ? filter.includes(color) : filter.includes("0");
}

/** Plain membership; empty filter matches everything. */
function plainMatch(value: string | undefined, filter?: string[]): boolean {
	if (!filter || filter.length === 0) return true;
	return value != null && filter.includes(value);
}

/** Edges touching `nodeId` in the requested direction. */
export function orientedEdges(
	direction: CanvasDirection,
	edges: CanvasEdge[],
	nodeId: string
): CanvasEdge[] {
	switch (direction) {
		case "incoming":
			return edges.filter((e) => e.toNode === nodeId);
		case "outgoing":
			return edges.filter((e) => e.fromNode === nodeId);
		case "bothsides":
			return edges.filter((e) => e.fromNode === nodeId || e.toNode === nodeId);
	}
}

/** The node id at the far end of `edge` from `nodeId`, per direction. */
function targetNodeId(
	direction: CanvasDirection,
	edge: CanvasEdge,
	nodeId: string
): string {
	if (direction === "incoming") return edge.fromNode;
	if (direction === "outgoing") return edge.toNode;
	return edge.fromNode === nodeId ? edge.toNode : edge.fromNode; // bothsides
}

/** File nodes connected to `node` by matching edges (unique by file path). */
export function resolveLinkedFiles(
	node: CanvasNode,
	data: CanvasData,
	opts: CanvasLinkOptions
): CanvasFileRef[] {
	const edges = orientedEdges(opts.direction, data.edges, node.id)
		.filter((e) => plainMatch(e.label, opts.edgeLabels))
		.filter((e) => colorMatch(e.color, opts.edgeColors))
		.filter((e) => plainMatch(e.fromSide, opts.edgeFromSides))
		.filter((e) => plainMatch(e.toSide, opts.edgeToSides));

	const byFile = new Map<string, CanvasFileRef>();
	for (const edge of edges) {
		const targetId = targetNodeId(opts.direction, edge, node.id);
		if (targetId === node.id) continue;
		const target = data.nodes.find((n) => n.id === targetId);
		if (!target || target.type !== "file" || !target.file) continue;
		if (!colorMatch(target.color, opts.nodeColors)) continue;
		if (opts.matchingFiles && !opts.matchingFiles.has(target.file)) continue;
		if (!byFile.has(target.file)) {
			byFile.set(target.file, { file: target.file, subpath: target.subpath });
		}
	}
	return [...byFile.values()];
}

/** True when file `node` is geometrically inside `group`. */
export function isNodeInGroup(node: CanvasNode, group: CanvasNode): boolean {
	return (
		group.x <= node.x &&
		group.y <= node.y &&
		group.x + group.width >= node.x + node.width &&
		group.y + group.height >= node.y + node.height
	);
}

/** Group nodes (matching filters) that contain `node`. */
export function groupsContaining(
	node: CanvasNode,
	groups: CanvasNode[],
	opts: CanvasGroupOptions
): CanvasNode[] {
	return groups
		.filter((g) => colorMatch(g.color, opts.groupColors))
		.filter((g) => plainMatch(g.label, opts.groupLabels))
		.filter((g) => isNodeInGroup(node, g));
}

/** Labels of the groups containing `node` (unique, non-empty). */
export function resolveGroupLabels(
	node: CanvasNode,
	data: CanvasData,
	opts: CanvasGroupOptions
): string[] {
	const groups = data.nodes.filter((n) => n.type === "group");
	const labels = groupsContaining(node, groups, opts)
		.map((g) => g.label)
		.filter((l): l is string => !!l);
	return [...new Set(labels)];
}

/** File nodes linked from the groups that contain `node` (unique by path). */
export function resolveGroupLinkedFiles(
	node: CanvasNode,
	data: CanvasData,
	opts: CanvasLinkOptions & CanvasGroupOptions
): CanvasFileRef[] {
	const groups = data.nodes.filter((n) => n.type === "group");
	const byFile = new Map<string, CanvasFileRef>();
	for (const group of groupsContaining(node, groups, opts)) {
		for (const ref of resolveLinkedFiles(group, data, opts)) {
			if (!byFile.has(ref.file)) byFile.set(ref.file, ref);
		}
	}
	return [...byFile.values()];
}
