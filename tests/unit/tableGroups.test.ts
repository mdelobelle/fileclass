import { describe, expect, it } from "vitest";

import { NO_GROUP_VALUE, groupProperty, renderedGroups } from "../../src/views/tableGroups";

/** A group in the shape Bases builds: entries, an optional key, and `hasKey()`. */
const group = (entries: string[], key?: string) => ({
	entries,
	key,
	hasKey: () => key !== undefined && key !== null,
});

describe("renderedGroups", () => {
	it("keeps the rows flat when the view groups on nothing", () => {
		// Bases hands an ungrouped view one keyless group holding everything.
		expect(renderedGroups([group(["a", "b"])], ["a", "b"])).toEqual([{ label: null, entries: ["a", "b"] }]);
	});

	it("falls back to the flat rows when the dataset offers no groups at all", () => {
		expect(renderedGroups(undefined, ["a"])).toEqual([{ label: null, entries: ["a"] }]);
		expect(renderedGroups([], ["a"])).toEqual([{ label: null, entries: ["a"] }]);
	});

	it("labels each group with its value, in the order Bases sorted them", () => {
		const groups = [group(["dune"], "Science fiction"), group(["frankenstein"], "Gothic")];
		expect(renderedGroups(groups, ["dune", "frankenstein"])).toEqual([
			{ label: "Science fiction", entries: ["dune"] },
			{ label: "Gothic", entries: ["frankenstein"] },
		]);
	});

	it("names the group of notes that have no value", () => {
		const groups = [group(["dune"], "Science fiction"), group(["untitled"])];
		expect(renderedGroups(groups, ["dune", "untitled"])[1]).toEqual({
			label: NO_GROUP_VALUE,
			entries: ["untitled"],
		});
	});

	it("keeps an empty value as a group of its own, distinct from having no value", () => {
		// Measured: `genre: ""` groups under the empty key with `hasKey()` true, beside a `None`
		// group for the notes without the property at all.
		const groups = [group(["blank"], ""), group(["dune"], "Science fiction"), group(["untitled"])];
		expect(renderedGroups(groups, []).map((g) => g.label)).toEqual(["", "Science fiction", NO_GROUP_VALUE]);
	});

	it("copies the entries rather than handing back the dataset's arrays", () => {
		const source = group(["dune"], "Science fiction");
		const out = renderedGroups([source], ["dune"]);
		out[0].entries.push("intruder");
		expect(source.entries).toEqual(["dune"]);
	});
});

describe("groupProperty", () => {
	it("reads the property a view groups on", () => {
		expect(groupProperty({ groupBy: { property: "note.genre", direction: "ASC" } })).toBe("note.genre");
	});

	it("accepts the property object Bases stores, whose toString is the id", () => {
		const property = { toString: () => "note.genre" };
		expect(groupProperty({ groupBy: { property, direction: "DESC" } })).toBe("note.genre");
	});

	it("answers nothing for a view that groups on nothing", () => {
		expect(groupProperty({})).toBe("");
		expect(groupProperty(undefined)).toBe("");
		expect(groupProperty({ groupBy: {} })).toBe("");
	});
});
