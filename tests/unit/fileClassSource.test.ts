import { describe, it, expect } from "vitest";

import { assembleFileClassSource, splitFileClassSource } from "../../src/schema/fileClassSource";

describe("splitFileClassSource", () => {
	it("splits a delimited definition into frontmatter and body", () => {
		const raw = "---\nfields: []\nextends: \"[[Note.fileclass]]\"\n---\n# Task\n\nA task.\n";
		expect(splitFileClassSource(raw)).toEqual({
			frontmatter: 'fields: []\nextends: "[[Note.fileclass]]"',
			body: "# Task\n\nA task.\n",
		});
	});
	it("handles a body-less definition", () => {
		expect(splitFileClassSource("---\nfields: []\n---\n")).toEqual({
			frontmatter: "fields: []",
			body: "",
		});
	});
	it("treats an undelimited file as pure YAML", () => {
		expect(splitFileClassSource("fields: []\n")).toEqual({
			frontmatter: "fields: []\n",
			body: "",
		});
	});
});

describe("assembleFileClassSource", () => {
	it("reassembles with a body", () => {
		expect(assembleFileClassSource("fields: []", "# Task\nA task.\n")).toBe(
			"---\nfields: []\n---\n# Task\nA task.\n"
		);
	});
	it("reassembles without a body", () => {
		expect(assembleFileClassSource("fields: []\n", "")).toBe("---\nfields: []\n---\n");
	});
	it("round-trips a delimited source", () => {
		const raw = "---\nfields: []\n---\n# Task\n\nbody\n";
		const { frontmatter, body } = splitFileClassSource(raw);
		expect(assembleFileClassSource(frontmatter, body)).toBe(raw);
	});
});
