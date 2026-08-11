import { describe, expect, it } from "vitest";

import {
	CanvasDoc,
	SchemaClass,
	claimCardText,
	claimedTags,
	desiredSchemaCanvas,
	extendsLabel,
	freeSlot,
	inactiveTagReason,
	nodeIdFor,
	reconcileSchemaCanvas,
} from "../../src/views/schemaCanvas";

const cls = (name: string, over: Partial<SchemaClass> = {}): SchemaClass => ({
	name,
	path: `Classes/${name}.md`,
	excludes: [],
	mapWithTag: false,
	tagNames: [],
	filesPaths: [],
	bookmarksGroups: [],
	baseDeps: [],
	canvasDeps: [],
	...over,
});

describe("ids are deterministic, because recognition depends on them", () => {
	it("names a node after what it stands for", () => {
		expect(nodeIdFor.fileClass("Book")).toBe("fileclass:Book");
		expect(nodeIdFor.base("Books.base")).toBe("base:Books.base");
		expect(nodeIdFor.canvas("Reading map.canvas")).toBe("canvas:Reading map.canvas");
		expect(nodeIdFor.claim("Book", "paths")).toBe("binding:Book:paths");
	});
});

describe("what the canvas should show", () => {
	it("gives every class a file node", () => {
		const { nodes } = desiredSchemaCanvas([cls("Book"), cls("Media")]);
		expect(nodes.map((n) => n.id)).toEqual(["fileclass:Book", "fileclass:Media"]);
		expect(nodes[0]).toMatchObject({ type: "file", file: "Classes/Book.md" });
	});

	it("draws inheritance, and labels it with what the child drops", () => {
		const { edges } = desiredSchemaCanvas([
			cls("Media"),
			cls("Book", { extends: "Media", excludes: ["producer", "runtime"] }),
		]);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({
			fromNode: "fileclass:Book",
			toNode: "fileclass:Media",
			label: "− producer, runtime",
		});
	});

	it("draws no inheritance edge to a class the vault does not have", () => {
		const { edges } = desiredSchemaCanvas([cls("Book", { extends: "Ghost" })]);
		expect(edges).toEqual([]);
	});

	it("shares one node between classes depending on the same base", () => {
		const deps = [{ path: "Authors.base", kind: "candidates" as const }];
		const { nodes, edges } = desiredSchemaCanvas([
			cls("Book", { baseDeps: deps }),
			cls("Comic", { baseDeps: deps }),
		]);
		expect(nodes.filter((n) => n.id === "base:Authors.base")).toHaveLength(1);
		expect(edges.filter((e) => e.toNode === "base:Authors.base")).toHaveLength(2);
	});

	it("distinguishes a base feeding values from one feeding candidates", () => {
		const { edges } = desiredSchemaCanvas([
			cls("Book", {
				baseDeps: [
					{ path: "Genres.base", kind: "values" },
					{ path: "Authors.base", kind: "candidates" },
				],
			}),
		]);
		expect(edges.map((e) => e.label)).toEqual(["values", "candidates"]);
	});

	it("cards a class's claims, and never an empty one", () => {
		const { nodes } = desiredSchemaCanvas([
			cls("Book", { filesPaths: ["Reading list"], bookmarksGroups: [] }),
		]);
		const ids = nodes.map((n) => n.id);
		expect(ids).toContain("binding:Book:paths");
		expect(ids).not.toContain("binding:Book:bookmarks");
		expect(ids).not.toContain("binding:Book:tags");
	});

	it("puts mapWithTag on the tags card, since the index treats it as a tag", () => {
		expect(claimedTags(cls("Book", { mapWithTag: true, tagNames: ["novel"] }))).toEqual([
			"Book",
			"novel",
		]);
		const { nodes } = desiredSchemaCanvas([cls("Book", { mapWithTag: true })]);
		expect(nodes.find((n) => n.id === "binding:Book:tags")?.text).toContain("Book");
	});
});

describe("a claim that cannot work says so", () => {
	it("knows which tags never bind", () => {
		expect(inactiveTagReason("novel")).toBeNull();
		expect(inactiveTagReason("Media Item")).toBe("a tag cannot contain a space");
		expect(inactiveTagReason("  ")).toBe("empty");
	});

	it("strikes the dead entry through, with the reason", () => {
		const text = claimCardText("tags", ["novel", "Media Item"]);
		expect(text).toContain("- novel");
		expect(text).toContain("- ~~Media Item~~ (a tag cannot contain a space)");
	});

	it("colours a card whose every tag is dead as inactive", () => {
		// `mapWithTag` on a class whose name has a space claims nothing at all, silently.
		const { nodes } = desiredSchemaCanvas([cls("Media Item", { mapWithTag: true })]);
		const card = nodes.find((n) => n.id === "binding:Media Item:tags");
		expect(card?.color).toBe("1");
	});

	it("caps a long list rather than growing the card", () => {
		const text = claimCardText("paths", ["a", "b", "c", "d", "e", "f", "g", "h"]);
		expect(text).toContain("- …and 2 more");
	});

	it("caps a long excludes label too", () => {
		expect(extendsLabel(["a", "b", "c", "d", "e"])).toBe("− a, b, c +2 more");
		expect(extendsLabel([])).toBeUndefined();
	});
});

describe("placement only ever fills a gap", () => {
	it("finds the first free slot, left to right", () => {
		const taken = [{ id: "x", type: "text" as const, x: 0, y: 0, width: 320, height: 100 }];
		expect(freeSlot(taken, 320, 100)).toEqual({ x: 380, y: 0 });
	});

	it("skips a row that is full", () => {
		const taken = Array.from({ length: 12 }, (_, i) => ({
			id: `n${i}`,
			type: "text" as const,
			x: i * 380,
			y: 0,
			width: 320,
			height: 100,
		}));
		expect(freeSlot(taken, 320, 100)).toEqual({ x: 0, y: 160 });
	});
});

describe("reconciling never moves what the reader arranged", () => {
	const desired = desiredSchemaCanvas([cls("Book", { filesPaths: ["Reading list"] })]);

	it("places everything on a first run", () => {
		const { doc, added, removed } = reconcileSchemaCanvas(null, desired);
		expect(added).toEqual(["fileclass:Book", "binding:Book:paths"]);
		expect(removed).toEqual([]);
		expect(doc.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
	});

	it("keeps the position, size and colour of a node it already knows", () => {
		const existing: CanvasDoc = {
			nodes: [
				{ id: "fileclass:Book", type: "file", file: "Classes/Book.md", x: 999, y: -50, width: 500, height: 240, color: "3" },
			],
			edges: [],
		};
		const { doc } = reconcileSchemaCanvas(existing, desired);
		expect(doc.nodes.find((n) => n.id === "fileclass:Book")).toMatchObject({
			x: 999,
			y: -50,
			width: 500,
			height: 240,
			color: "3",
		});
	});

	it("rewrites a claim card's text while keeping the box it was given", () => {
		const existing: CanvasDoc = {
			nodes: [
				{ id: "binding:Book:paths", type: "text", text: "**Files paths**\n- Old", x: 10, y: 20, width: 640, height: 300, color: "6" },
			],
			edges: [],
		};
		const { doc, updated } = reconcileSchemaCanvas(existing, desired);
		const card = doc.nodes.find((n) => n.id === "binding:Book:paths");
		expect(card?.text).toContain("- Reading list");
		expect(card).toMatchObject({ x: 10, y: 20, width: 640, height: 300 });
		expect(updated).toContain("binding:Book:paths");
	});

	it("drops a node of ours the classes no longer justify, and its edges", () => {
		const existing: CanvasDoc = {
			nodes: [
				{ id: "fileclass:Gone", type: "file", file: "Classes/Gone.md", x: 0, y: 0, width: 320, height: 100 },
			],
			edges: [
				{ id: "edge:Gone:extends", fromNode: "fileclass:Gone", fromSide: "top", toNode: "fileclass:Book", toSide: "bottom" },
			],
		};
		const { doc, removed } = reconcileSchemaCanvas(existing, desired);
		expect(removed).toEqual(["fileclass:Gone"]);
		expect(doc.nodes.map((n) => n.id)).not.toContain("fileclass:Gone");
		expect(doc.edges.map((e) => e.id)).not.toContain("edge:Gone:extends");
	});

	it("leaves alone a node the reader added, and its edges between kept nodes", () => {
		const existing: CanvasDoc = {
			nodes: [
				{ id: "abc123", type: "text", text: "my own note about this model", x: -400, y: 0, width: 300, height: 80 },
				{ id: "fileclass:Book", type: "file", file: "Classes/Book.md", x: 0, y: 0, width: 320, height: 100 },
			],
			edges: [{ id: "mine1", fromNode: "abc123", fromSide: "right", toNode: "fileclass:Book", toSide: "left" }],
		};
		const { doc, removed } = reconcileSchemaCanvas(existing, desired);
		expect(removed).toEqual([]);
		expect(doc.nodes.find((n) => n.id === "abc123")).toMatchObject({ x: -400, text: "my own note about this model" });
		expect(doc.edges.map((e) => e.id)).toContain("mine1");
	});

	it("is idempotent: a second run reports nothing to do", () => {
		const first = reconcileSchemaCanvas(null, desired);
		const second = reconcileSchemaCanvas(first.doc, desired);
		expect(second.added).toEqual([]);
		expect(second.removed).toEqual([]);
		expect(second.updated).toEqual([]);
		expect(second.doc).toEqual(first.doc);
	});
});
