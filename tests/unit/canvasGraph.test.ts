import { describe, expect, it } from "vitest";

import {
	CanvasData,
	CanvasNode,
	isNodeInGroup,
	orientedEdges,
	parseCanvas,
	resolveGroupLabels,
	resolveGroupLinkedFiles,
	resolveLinkedFiles,
} from "../../src/fields/canvas/canvasGraph";

function fileNode(id: string, file: string, extra: Partial<CanvasNode> = {}): CanvasNode {
	return { id, type: "file", file, x: 0, y: 0, width: 100, height: 100, ...extra };
}
function groupNode(id: string, extra: Partial<CanvasNode> = {}): CanvasNode {
	return { id, type: "group", x: 0, y: 0, width: 1000, height: 1000, ...extra };
}

// A ← center → B, plus an edge A→center (so center has incoming from A, outgoing to B).
const graph: CanvasData = {
	nodes: [
		fileNode("n-a", "A.md"),
		fileNode("n-c", "Center.md"),
		fileNode("n-b", "B.md"),
	],
	edges: [
		{ id: "e1", fromNode: "n-a", toNode: "n-c" },
		{ id: "e2", fromNode: "n-c", toNode: "n-b" },
	],
};

describe("parseCanvas", () => {
	it("returns an empty graph for malformed JSON", () => {
		expect(parseCanvas("{not json")).toEqual({ nodes: [], edges: [] });
	});
	it("defaults missing arrays", () => {
		expect(parseCanvas("{}")).toEqual({ nodes: [], edges: [] });
	});
});

describe("orientedEdges", () => {
	it("selects by direction", () => {
		expect(orientedEdges("incoming", graph.edges, "n-c").map((e) => e.id)).toEqual(["e1"]);
		expect(orientedEdges("outgoing", graph.edges, "n-c").map((e) => e.id)).toEqual(["e2"]);
		expect(orientedEdges("bothsides", graph.edges, "n-c").map((e) => e.id)).toEqual(["e1", "e2"]);
	});
});

describe("resolveLinkedFiles", () => {
	const center = graph.nodes[1];
	it("incoming yields the source note", () => {
		expect(resolveLinkedFiles(center, graph, { direction: "incoming" })).toEqual([{ file: "A.md", subpath: undefined }]);
	});
	it("outgoing yields the target note", () => {
		expect(resolveLinkedFiles(center, graph, { direction: "outgoing" })).toEqual([{ file: "B.md", subpath: undefined }]);
	});
	it("bothsides yields both, unique", () => {
		expect(resolveLinkedFiles(center, graph, { direction: "bothsides" }).map((r) => r.file)).toEqual([
			"A.md",
			"B.md",
		]);
	});
	it("filters by edge label", () => {
		const g: CanvasData = {
			nodes: graph.nodes,
			edges: [
				{ id: "e1", fromNode: "n-a", toNode: "n-c", label: "rel" },
				{ id: "e2", fromNode: "n-b", toNode: "n-c", label: "other" },
			],
		};
		expect(resolveLinkedFiles(graph.nodes[1], g, { direction: "incoming", edgeLabels: ["rel"] }).map((r) => r.file)).toEqual(["A.md"]);
	});
	it("ignores non-file target nodes", () => {
		const g: CanvasData = {
			nodes: [fileNode("n-c", "Center.md"), { id: "t", type: "text", x: 0, y: 0, width: 1, height: 1 }],
			edges: [{ id: "e", fromNode: "n-c", toNode: "t" }],
		};
		expect(resolveLinkedFiles(g.nodes[0], g, { direction: "outgoing" })).toEqual([]);
	});
	it("restricts to matchingFiles when provided", () => {
		const center = graph.nodes[1];
		expect(
			resolveLinkedFiles(center, graph, { direction: "bothsides", matchingFiles: new Set(["B.md"]) }).map(
				(r) => r.file
			)
		).toEqual(["B.md"]);
		expect(
			resolveLinkedFiles(center, graph, { direction: "bothsides", matchingFiles: new Set() })
		).toEqual([]);
	});
	it("is disjunctive within a filter and conjunctive across filters", () => {
		// Edges into Center, each from a distinct file, with color + label.
		const g: CanvasData = {
			nodes: [
				fileNode("n-c", "Center.md"),
				fileNode("n-a", "A.md"),
				fileNode("n-b", "B.md"),
				fileNode("n-d", "D.md"),
				fileNode("n-e", "E.md"),
			],
			edges: [
				{ id: "e1", fromNode: "n-a", toNode: "n-c", color: "1", label: "important" }, // red + important
				{ id: "e2", fromNode: "n-b", toNode: "n-c", color: "3", label: "urgent" }, // yellow + urgent
				{ id: "e3", fromNode: "n-d", toNode: "n-c", color: "2", label: "important" }, // orange + important
				{ id: "e4", fromNode: "n-e", toNode: "n-c", color: "1", label: "later" }, // red + later
			],
		};
		const center = g.nodes[0];
		// Colors red OR yellow → A, B, E (orange D excluded).
		expect(
			resolveLinkedFiles(center, g, { direction: "incoming", edgeColors: ["1", "3"] }).map((r) => r.file)
		).toEqual(["A.md", "B.md", "E.md"]);
		// (red OR yellow) AND (important OR urgent) → A, B (E is "later", D is orange).
		expect(
			resolveLinkedFiles(center, g, {
				direction: "incoming",
				edgeColors: ["1", "3"],
				edgeLabels: ["important", "urgent"],
			}).map((r) => r.file)
		).toEqual(["A.md", "B.md"]);
	});
	it("treats edge color '0' as no-color", () => {
		const g: CanvasData = {
			nodes: graph.nodes,
			edges: [{ id: "e1", fromNode: "n-a", toNode: "n-c" }],
		};
		expect(resolveLinkedFiles(graph.nodes[1], g, { direction: "incoming", edgeColors: ["0"] }).map((r) => r.file)).toEqual(["A.md"]);
		expect(resolveLinkedFiles(graph.nodes[1], g, { direction: "incoming", edgeColors: ["1"] })).toEqual([]);
	});
});

describe("isNodeInGroup / groups", () => {
	const inside = fileNode("in", "In.md", { x: 100, y: 100, width: 50, height: 50 });
	const outside = fileNode("out", "Out.md", { x: 2000, y: 2000, width: 50, height: 50 });
	const group = groupNode("g", { label: "Cluster" });

	it("detects geometric containment", () => {
		expect(isNodeInGroup(inside, group)).toBe(true);
		expect(isNodeInGroup(outside, group)).toBe(false);
	});

	it("resolves group labels for a contained node", () => {
		const data: CanvasData = { nodes: [group, inside, outside], edges: [] };
		expect(resolveGroupLabels(inside, data, {})).toEqual(["Cluster"]);
		expect(resolveGroupLabels(outside, data, {})).toEqual([]);
	});

	it("resolves files linked from the node's group", () => {
		const linked = fileNode("lk", "Linked.md", { x: 200, y: 200, width: 50, height: 50 });
		const data: CanvasData = {
			nodes: [group, inside, linked],
			edges: [{ id: "e", fromNode: "g", toNode: "lk" }],
		};
		expect(resolveGroupLinkedFiles(inside, data, { direction: "outgoing" }).map((r) => r.file)).toEqual([
			"Linked.md",
		]);
	});
});
