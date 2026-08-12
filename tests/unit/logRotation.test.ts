import { describe, expect, it } from "vitest";

import {
	archiveName,
	archiveNumber,
	archivesToPrune,
	nextArchiveNumber,
	shouldRotate,
} from "../../src/log/logRotation";

describe("archive names", () => {
	it("zero-pads, so a directory listing sorts chronologically", () => {
		expect(archiveName(1)).toBe("archive_0001.log");
		expect(archiveName(42)).toBe("archive_0042.log");
		expect([archiveName(9), archiveName(10)].sort()).toEqual(["archive_0009.log", "archive_0010.log"]);
	});

	it("keeps counting past four digits rather than wrapping", () => {
		expect(archiveName(12345)).toBe("archive_12345.log");
		expect(archiveNumber("archive_12345.log")).toBe(12345);
	});

	it("recognises only its own", () => {
		expect(archiveNumber("archive_0007.log")).toBe(7);
		expect(archiveNumber("archive_7.log")).toBeNull();
		expect(archiveNumber("fileclass.log")).toBeNull();
		expect(archiveNumber("archive_0007.md")).toBeNull();
	});
});

describe("which number the next archive takes", () => {
	it("starts at one", () => {
		expect(nextArchiveNumber([])).toBe(1);
	});

	it("goes past the highest that exists, never filling a gap", () => {
		// Reusing a pruned number would make an archive's name a lie about when it was written.
		expect(nextArchiveNumber(["archive_0001.log", "archive_0003.log"])).toBe(4);
	});

	it("ignores files that are not archives", () => {
		expect(nextArchiveNumber(["fileclass.log", "notes.txt", "archive_0002.log"])).toBe(3);
	});
});

describe("pruning", () => {
	const names = ["archive_0003.log", "archive_0001.log", "archive_0002.log"];

	it("removes the oldest, whatever order the folder lists them in", () => {
		expect(archivesToPrune(names, 2)).toEqual(["archive_0001.log"]);
		expect(archivesToPrune(names, 1)).toEqual(["archive_0001.log", "archive_0002.log"]);
	});

	it("keeps everything when there is room", () => {
		expect(archivesToPrune(names, 5)).toEqual([]);
		expect(archivesToPrune([], 5)).toEqual([]);
	});

	it("removes all of them when none are to be kept", () => {
		// A legitimate choice: recent history and nothing else, with the disk cost bounded.
		expect(archivesToPrune(names, 0)).toHaveLength(3);
	});

	it("leaves foreign files alone", () => {
		expect(archivesToPrune(["archive_0001.log", "somebody-elses.log"], 0)).toEqual(["archive_0001.log"]);
	});
});

describe("when to roll over", () => {
	it("rolls over once past the cap", () => {
		expect(shouldRotate(500, 500)).toBe(false);
		expect(shouldRotate(501, 500)).toBe(true);
	});

	it("never rolls over when the cap is off", () => {
		expect(shouldRotate(10_000, 0)).toBe(false);
		expect(shouldRotate(10_000, -1)).toBe(false);
	});
});
