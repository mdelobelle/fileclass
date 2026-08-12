import { describe, expect, it } from "vitest";

import {
	AuditWorld,
	AuditedClass,
	Finding,
	auditClass,
	describeAudit,
	diffFindings,
	findingLabel,
	fingerprint,
} from "../../src/schema/schemaAudit";

const world = (over: Partial<AuditWorld> = {}): AuditWorld => ({
	fileExists: (p) => ["Values/Rating.md", "Authors.base", "Reading map.canvas", "Books.base"].includes(p),
	folderExists: (p) => ["Reading list"].includes(p),
	knownClasses: new Set(["Media", "Book"]),
	fieldsOf: () => ["acquired", "rating"],
	...over,
});

const cls = (over: Partial<AuditedClass> = {}): AuditedClass => ({
	name: "Book",
	fields: [],
	...over,
});

describe("what the audit calls broken", () => {
	it("says nothing about a schema whose paths all resolve", () => {
		const found = auditClass(
			cls({
				baseFile: "Books.base",
				filesPaths: ["Reading list"],
				fields: [
					{ name: "rating", options: { valuesListNotePath: "Values/Rating.md" } },
					{ name: "author", options: { baseFile: "Authors.base" } },
					{ name: "leads to", options: { canvasPath: "Reading map.canvas" } },
				],
			}),
			world()
		);
		expect(found).toEqual([]);
	});

	it("finds a values note that is not there", () => {
		const [found] = auditClass(
			cls({ fields: [{ name: "rating", options: { valuesListNotePath: "Values/Gone.md" } }] }),
			world()
		);
		expect(found).toMatchObject({
			fileClass: "Book",
			field: "rating",
			kind: "missing-path",
			level: "ERROR",
			consequence: "the field offers no values",
		});
	});

	it("accepts a note path stored without its extension", () => {
		// The resolver takes both forms; flagging one of them would be a false alarm.
		expect(
			auditClass(cls({ fields: [{ name: "r", options: { valuesListNotePath: "Values/Rating" } }] }), world())
		).toEqual([]);
	});

	it("tells a missing base from a missing canvas, by what each costs", () => {
		const found = auditClass(
			cls({
				fields: [
					{ name: "author", options: { baseFile: "Gone.base" } },
					{ name: "leads to", options: { canvasPath: "Gone.canvas" } },
				],
			}),
			world()
		);
		expect(found.map((f) => f.consequence)).toEqual([
			"the field offers no candidates",
			"the field stops following the canvas",
		]);
	});

	it("finds a claimed folder that no longer exists — the one that costs notes their class", () => {
		const [found] = auditClass(cls({ filesPaths: ["Gone folder"] }), world());
		expect(found).toMatchObject({
			kind: "missing-folder",
			level: "ERROR",
			consequence: "no note is bound by this folder",
		});
		expect(found.field).toBeUndefined();
	});

	it("does not confuse a folder with a file", () => {
		// `Reading list` is a folder: a class claiming it is fine, and `fileExists` must not decide.
		expect(auditClass(cls({ filesPaths: ["Reading list"] }), world())).toEqual([]);
	});

	it("finds an extends naming a class the vault does not have", () => {
		const [found] = auditClass(cls({ extends: "Ghost" }), world());
		expect(found).toMatchObject({
			kind: "missing-parent",
			level: "ERROR",
			consequence: "the inherited fields are missing",
		});
	});
});

describe("what the audit calls silent", () => {
	it("finds a tag that can never bind", () => {
		const [found] = auditClass(cls({ tagNames: ["two words"] }), world());
		expect(found).toMatchObject({ kind: "dead-tag", level: "WARNING", value: "two words" });
	});

	it("catches mapWithTag on a class whose own name has a space", () => {
		// The class name becomes the tag, so such a class claims nothing at all — measured (#149).
		const found = auditClass(cls({ name: "Media Item", mapWithTag: true }), world());
		expect(found.map((f) => f.kind)).toEqual(["dead-tag"]);
	});

	it("leaves a workable tag alone, hash or no hash", () => {
		expect(auditClass(cls({ tagNames: ["novel", "#comics"] }), world())).toEqual([]);
	});

	it("finds an excludes naming a field the parent never declared", () => {
		const [found] = auditClass(cls({ extends: "Media", excludes: ["nonesuch"] }), world());
		expect(found).toMatchObject({ kind: "unknown-exclude", level: "WARNING" });
	});

	it("says nothing about excludes when the parent itself is missing", () => {
		// One problem, one line: the missing parent is the thing to fix.
		const found = auditClass(cls({ extends: "Ghost", excludes: ["nonesuch"] }), world());
		expect(found.map((f) => f.kind)).toEqual(["missing-parent"]);
	});
});

describe("how findings are named and counted", () => {
	it("names a field-level finding by its field, a class-level one by its class", () => {
		expect(findingLabel({ fileClass: "Book", field: "author", kind: "missing-path", level: "ERROR", value: "", consequence: "" })).toBe("Book › author");
		expect(findingLabel({ fileClass: "Book", kind: "missing-folder", level: "ERROR", value: "", consequence: "" })).toBe("Book");
	});

	it("summarises a clean sweep as a clean sweep", () => {
		expect(describeAudit([])).toContain("points at something that exists");
	});

	it("counts what is broken apart from what will never bind", () => {
		const f = (level: "ERROR" | "WARNING") => ({
			fileClass: "Book",
			kind: "missing-path" as const,
			level,
			value: "",
			consequence: "",
		});
		expect(describeAudit([f("ERROR"), f("ERROR"), f("WARNING")])).toBe(
			"Fileclass: 2 broken references, 1 that will never bind — see the schema log."
		);
	});
});

describe("a sweep only writes what changed", () => {
	const finding = (over: Partial<Finding> = {}): Finding => ({
		fileClass: "Book",
		field: "author",
		kind: "missing-path",
		level: "ERROR",
		value: "Gone.base",
		consequence: "the field offers no candidates",
		...over,
	});
	const logged = (f: Finding, event = `schema.${f.kind}`) => ({
		event,
		details: { fingerprint: fingerprint(f) },
	});

	it("writes a problem the first time it is seen", () => {
		expect(diffFindings([], [finding()]).fresh).toHaveLength(1);
	});

	it("stays quiet about one already in the log", () => {
		// Otherwise every session re-lists the same twelve problems, and the line that says
		// something *changed* is lost in the copies.
		const f = finding();
		expect(diffFindings([logged(f)], [f]).fresh).toEqual([]);
	});

	it("records a problem that went away", () => {
		const f = finding();
		expect(diffFindings([logged(f)], []).resolved).toEqual([fingerprint(f)]);
	});

	it("writes it again if it comes back after being fixed", () => {
		const f = finding();
		const history = [logged(f), logged(f, "schema.resolved")];
		expect(diffFindings(history, [f]).fresh).toHaveLength(1);
	});

	it("tells two findings apart by class, field and value, not by wording", () => {
		const a = finding();
		const b = finding({ field: "cover" });
		expect(diffFindings([logged(a)], [a, b]).fresh).toEqual([b]);
		// The message is prose and may be reworded; the fingerprint must not move with it.
		const reworded = finding({ consequence: "something else entirely" });
		expect(diffFindings([logged(a)], [reworded]).fresh).toEqual([]);
	});

	it("ignores log lines that are not findings", () => {
		const f = finding();
		const history = [{ event: "schema.file-moved" }, { event: "schema.migrated", details: {} }];
		expect(diffFindings(history, [f]).fresh).toEqual([f]);
		expect(diffFindings(history, []).resolved).toEqual([]);
	});
});
