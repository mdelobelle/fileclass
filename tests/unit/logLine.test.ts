import { describe, expect, it } from "vitest";

import { LogEntry, formatLine, logStamp, parseLine, parseLog } from "../../src/log/logLine";

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
	stamp: "2026-08-12 08:15:51",
	level: "ERROR",
	event: "schema.file-moved",
	message: 'Book › author: "Authors.base" moved',
	...over,
});

describe("a line, written", () => {
	it("is tab-separated, so the viewer parses it by splitting rather than by guessing", () => {
		expect(formatLine(entry())).toBe(
			'2026-08-12 08:15:51\tERROR\tschema.file-moved\tBook › author: "Authors.base" moved'
		);
	});

	it("carries structured details as a JSON tail", () => {
		const line = formatLine(entry({ details: { fileClass: "Book", field: "author" } }));
		expect(line.split("\t")).toHaveLength(5);
		expect(line.endsWith('{"fileClass":"Book","field":"author"}')).toBe(true);
	});

	it("omits the tail when there is nothing structured to say", () => {
		expect(formatLine(entry({ details: {} })).split("\t")).toHaveLength(4);
	});

	it("keeps a record on one line whatever the message contains", () => {
		// Tabs and newlines are the separators; one in a field would split the record in two.
		const line = formatLine(entry({ message: "a\tb\nc" }));
		expect(line.split("\t")).toHaveLength(4);
		expect(line).not.toContain("\n");
	});
});

describe("a line, read back", () => {
	it("round-trips", () => {
		const source = entry({ details: { fileClass: "Book" } });
		expect(parseLine(formatLine(source))).toEqual(source);
	});

	it("skips the header and blank lines rather than failing on them", () => {
		expect(parseLine("# Fileclass log")).toBeNull();
		expect(parseLine("")).toBeNull();
		expect(parseLine("   ")).toBeNull();
	});

	it("skips a line that is not ours, since the file is one a person can type into", () => {
		expect(parseLine("just some text")).toBeNull();
		expect(parseLine("2026-08-12 08:15:51\tSHOUT\tx\ty")).toBeNull();
	});

	it("keeps the entry when the JSON tail is broken", () => {
		// The message is the part a reader needs; malformed details are not worth losing it over.
		const parsed = parseLine('2026-08-12 08:15:51\tINFO\tx\thello\t{not json');
		expect(parsed?.message).toBe("hello");
		expect(parsed?.details).toBeUndefined();
	});

	it("reads a whole file, oldest first", () => {
		const content = ["# header", "", formatLine(entry()), formatLine(entry({ level: "INFO" }))].join("\n");
		const entries = parseLog(content);
		expect(entries.map((e) => e.level)).toEqual(["ERROR", "INFO"]);
	});
});

describe("the stamp", () => {
	it("is local time, zero-padded, sortable as text", () => {
		expect(logStamp(new Date(2026, 7, 12, 8, 20, 14))).toBe("2026-08-12 08:20:14");
		expect(logStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02 03:04:05");
	});
});
