import { describe, expect, it } from "vitest";

import { Field, PATH_SEPARATOR } from "../../src/schema/field";
import { ancestorNames } from "../../src/schema/renameProperty";

const field = (id: string, name: string, path = ""): Field => ({
	id,
	name,
	type: "Input",
	options: [],
	path,
	fileClassName: "Comic",
});

const storage = field("stOrge", "storage");
const shelf = field("shElf1", "shelf", "stOrge");
const unit = field("unIt01", "unit", `stOrge${PATH_SEPARATOR}shElf1`);

describe("the groups a field lives under", () => {
	it("is empty for a root field", () => {
		expect(ancestorNames([storage, shelf, unit], storage)).toEqual([]);
	});

	it("names one level", () => {
		expect(ancestorNames([storage, shelf, unit], shelf)).toEqual(["storage"]);
	});

	it("names them outermost first, which is the order a frontmatter is descended in", () => {
		expect(ancestorNames([storage, shelf, unit], unit)).toEqual(["storage", "shelf"]);
	});

	it("resolves ids to names, since the file holds names and the path holds ids", () => {
		// A rename that looked up `stOrge` in the note would find nothing at all.
		expect(ancestorNames([storage, shelf], shelf)).not.toContain("stOrge");
	});

	it("survives an ancestor that no longer exists", () => {
		// A group deleted while a child lingers: better an empty name than a thrown rename.
		expect(ancestorNames([shelf], shelf)).toEqual([""]);
	});
});
