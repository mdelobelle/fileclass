import { describe, it, expect } from "vitest";

import { resolveExtendsName, resolveInnerFileClassNames } from "../../src/schema/resolver";

const nameByPath = new Map([
	["cls/Area.fileclass.md", "Area.fileclass"],
	["cls/Task.fileclass.md", "Task.fileclass"],
]);
const resolve = (link: string): string | null => {
	const hit = [...nameByPath.keys()].find((p) => p.endsWith(`/${link}.md`));
	return hit ?? null;
};

describe("resolveInnerFileClassNames", () => {
	it("resolves a scalar alias link (key === alias)", () => {
		const links = [{ key: "fileClass", link: "Area.fileclass" }];
		expect(resolveInnerFileClassNames(links, "fileClass", resolve, nameByPath)).toEqual([
			"Area.fileclass",
		]);
	});
	it("resolves array items (key === alias.<n>) preserving order", () => {
		const links = [
			{ key: "fileClass.0", link: "Area.fileclass" },
			{ key: "fileClass.1", link: "Task.fileclass" },
		];
		expect(resolveInnerFileClassNames(links, "fileClass", resolve, nameByPath)).toEqual([
			"Area.fileclass",
			"Task.fileclass",
		]);
	});
	it("ignores links for other frontmatter keys", () => {
		const links = [{ key: "blueprint", link: "Area.fileclass" }];
		expect(resolveInnerFileClassNames(links, "fileClass", resolve, nameByPath)).toEqual([]);
	});
	it("drops unresolved links and non-fileclass targets, de-dupes", () => {
		const links = [
			{ key: "fileClass.0", link: "Missing.fileclass" },
			{ key: "fileClass.1", link: "Area.fileclass" },
			{ key: "fileClass.2", link: "Area.fileclass" },
		];
		expect(resolveInnerFileClassNames(links, "fileClass", resolve, nameByPath)).toEqual([
			"Area.fileclass",
		]);
	});
});

describe("resolveExtendsName", () => {
	const has = (n: string): boolean => n === "Note.fileclass" || n === "Global.fileclass";
	const resolveLink = (link: string): string | undefined =>
		link === "Note.fileclass" ? "Note.fileclass" : undefined;

	it("resolves a wikilink extends", () => {
		expect(resolveExtendsName('[[Note.fileclass]]', resolveLink, has)).toBe("Note.fileclass");
	});
	it("strips a |alias and #subpath from the wikilink before resolving", () => {
		expect(resolveExtendsName('[[Note.fileclass|Note]]', resolveLink, has)).toBe("Note.fileclass");
		expect(resolveExtendsName('[[Note.fileclass#Heading]]', resolveLink, has)).toBe(
			"Note.fileclass"
		);
	});
	it("resolves a bare name that already matches a registry key", () => {
		expect(resolveExtendsName("Note.fileclass", resolveLink, has)).toBe("Note.fileclass");
	});
	it("resolves a bare display name by appending the .fileclass suffix", () => {
		expect(resolveExtendsName("Note", resolveLink, has)).toBe("Note.fileclass");
	});
	it("returns undefined for empty or unresolvable values", () => {
		expect(resolveExtendsName(undefined, resolveLink, has)).toBeUndefined();
		expect(resolveExtendsName("[[Missing.fileclass]]", resolveLink, has)).toBeUndefined();
		expect(resolveExtendsName("Nope", resolveLink, has)).toBeUndefined();
	});
});
