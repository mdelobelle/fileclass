import { describe, expect, it } from "vitest";

import { columnLabel, fieldForColumn, fieldNameOfColumn, parseCellSegments } from "../../src/views/columns";

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

describe("fieldForColumn", () => {
	const fields = [
		{ name: "status", type: "Select" },
		{ name: "daily note", type: "File" },
		{ name: "pages", type: "Number" },
	];

	it("finds the field a column names", () => {
		expect(fieldForColumn("note.status", fields)?.name).toBe("status");
		expect(fieldForColumn("note.daily note", fields)?.name).toBe("daily note");
	});

	it("finds it when Bases capitalised the column", () => {
		// Measured on a real vault: the property registry keys entries in lowercase but keeps the
		// display name of the first spelling seen, so a class whose field is `status` gets handed
		// `note.Status` — and its cells were simply not editable.
		expect(fieldForColumn("note.Status", fields)?.name).toBe("status");
		expect(fieldForColumn("note.DAILY NOTE", fields)?.name).toBe("daily note");
	});

	it("prefers an exact match over a differently-cased one", () => {
		const both = [{ name: "Status", type: "Input" }, { name: "status", type: "Select" }];
		expect(fieldForColumn("note.status", both)?.type).toBe("Select");
		expect(fieldForColumn("note.Status", both)?.type).toBe("Input");
	});

	it("answers nothing for a column that names no field", () => {
		expect(fieldForColumn("file.name", fields)).toBeUndefined();
		expect(fieldForColumn("formula.total", fields)).toBeUndefined();
		expect(fieldForColumn("note.missing", fields)).toBeUndefined();
	});

	it("honours the caller's filter, and keeps looking past a field it rejects", () => {
		const accept = (f: { type: string }) => f.type !== "Select";
		expect(fieldForColumn("note.Status", fields, accept)).toBeUndefined();
		expect(fieldForColumn("note.pages", fields, accept)?.name).toBe("pages");
	});
});
