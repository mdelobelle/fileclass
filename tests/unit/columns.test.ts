import { describe, expect, it } from "vitest";

import { columnLabel, fieldNameOfColumn, parseCellSegments } from "../../src/views/columns";

describe("fieldNameOfColumn", () => {
	it("extracts the field name from note.* columns only", () => {
		expect(fieldNameOfColumn("note.author")).toBe("author");
		expect(fieldNameOfColumn("file.name")).toBeNull();
		expect(fieldNameOfColumn("formula.total")).toBeNull();
	});
});

describe("columnLabel", () => {
	it("labels note/file/formula columns", () => {
		expect(columnLabel("note.author")).toBe("author");
		expect(columnLabel("file.name")).toBe("Name");
		expect(columnLabel("file.ctime")).toBe("ctime");
		expect(columnLabel("formula.total")).toBe("total");
		expect(columnLabel("bare")).toBe("bare");
	});
});

describe("parseCellSegments", () => {
	it("splits wikilinks from surrounding text", () => {
		expect(parseCellSegments("[[Note]]")).toEqual([{ link: "Note", display: "Note" }]);
		expect(parseCellSegments("[[Path/Note|Alias]]")).toEqual([
			{ link: "Path/Note", display: "Alias" },
		]);
		expect(parseCellSegments("[[A]], [[B]]")).toEqual([
			{ link: "A", display: "A" },
			{ text: ", " },
			{ link: "B", display: "B" },
		]);
	});

	it("handles embeds and headings, and plain text", () => {
		expect(parseCellSegments("![[Img]]")).toEqual([{ link: "Img", display: "Img" }]);
		expect(parseCellSegments("[[Note#Heading]]")).toEqual([{ link: "Note", display: "Note" }]);
		expect(parseCellSegments("just text")).toEqual([{ text: "just text" }]);
		expect(parseCellSegments("")).toEqual([]);
	});
});
