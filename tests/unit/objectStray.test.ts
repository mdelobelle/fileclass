import { describe, expect, it } from "vitest";

import { Field, pathFieldNames } from "../../src/schema/field";
import { describeField, strayText } from "../../src/fields/objectDisplay";
import { validateField } from "../../src/fields/validate";

const field = (over: Partial<Field> = {}): Field => ({
	id: "pub01",
	name: "publisher",
	type: "Object",
	options: {},
	path: "",
	fileClassName: "Book",
	...over,
});

// `formatMoment` is required by the type; nothing here formats a date.
const deps = { allFields: [] as Field[], formatMoment: (iso: string) => iso };

describe("a value that isn't a group", () => {
	it("is what a field holds after its type changed, and it used to vanish", () => {
		// Dune carried `publisher: Chilton Books` for nineteen takes. Making publisher
		// a group turned that into: nothing shown, nothing flagged, and `{}` written
		// over it on the next save.
		expect(strayText("Chilton Books")).toBe("Chilton Books");
		expect(describeField(field(), "Chilton Books", deps)).toBe("Chilton Books");
	});

	it("is reported as a violation, so it shows up where violations show up", () => {
		expect(validateField(field(), "Chilton Books").ok).toBe(false);
		expect(validateField(field(), "Chilton Books").message).toContain("group of properties");
		expect(validateField(field(), { name: "Chilton Books" }).ok).toBe(true);
	});

	it("leaves a proper group and an empty value alone", () => {
		expect(strayText({ name: "x" })).toBeNull();
		expect(strayText(undefined)).toBeNull();
		expect(strayText("")).toBeNull();
		expect(validateField(field(), undefined).ok).toBe(true); // empty is always valid
	});

	it("applies to ObjectList, per item as well as whole", () => {
		const list = field({ type: "ObjectList", name: "editions" });
		expect(validateField(list, "Chilton Books").ok).toBe(false);
		expect(validateField(list, ["1965", { year: 1965 }]).ok).toBe(false);
		expect(validateField(list, [{ year: 1965 }]).ok).toBe(true);
		expect(describeField(list, "Chilton Books", deps)).toBe("Chilton Books");
	});
});

describe("a group inside a group", () => {
	const publisher: Field = {
		id: "pub", name: "publisher", type: "Object", path: "", fileClassName: "Book",
		options: { displayTemplate: "{{name}} - {{headquarter}}" },
	};
	const name: Field = { id: "nm", name: "name", type: "Input", path: "pub", fileClassName: "Book", options: {} };
	const hq: Field = {
		id: "hq", name: "headquarter", type: "Object", path: "pub", fileClassName: "Book",
		options: { displayTemplate: "{{city}} ({{country}})" },
	};
	const city: Field = { id: "ct", name: "city", type: "Input", path: "pub____hq", fileClassName: "Book", options: {} };
	const country: Field = { id: "cy", name: "country", type: "Input", path: "pub____hq", fileClassName: "Book", options: {} };
	const d = { allFields: [publisher, name, hq, city, country], formatMoment: (iso: string) => iso };
	const value = { name: "Chilton Books", headquarter: { city: "Philadelphia", country: "United States" } };

	it("renders a nested group through that group's own template", () => {
		// One mechanism, not two: a token naming a child group defers to its template,
		// which is why reaching a grandchild needs no path syntax of its own.
		expect(describeField(publisher, value, d)).toBe("Chilton Books - Philadelphia (United States)");
	});

	it("renders nothing for a token that names no child, and keeps the rest", () => {
		const wrong = { ...publisher, options: { displayTemplate: "{{name}} - {{zip}}" } };
		expect(describeField(wrong, value, d)).toBe("Chilton Books -");
	});

	it("falls back to the first non-empty child when no template is set", () => {
		const bare = { ...publisher, options: {} };
		expect(describeField(bare, value, d)).toBe("Chilton Books");
	});
});

describe("the trail a breadcrumb needs", () => {
	const publisher: Field = { id: "pub", name: "publisher", type: "Object", path: "", fileClassName: "Book", options: {} };
	const hq: Field = { id: "hq", name: "headquarter", type: "Object", path: "pub", fileClassName: "Book", options: {} };
	const city: Field = { id: "ct", name: "city", type: "Input", path: "pub____hq", fileClassName: "Book", options: {} };
	const all = [publisher, hq, city];

	it("names every field the path runs through, outermost first", () => {
		// "Book › publisher › headquarter › children", not "Book › children".
		expect(pathFieldNames(all, "pub____hq")).toEqual(["publisher", "headquarter"]);
		expect(pathFieldNames(all, "pub")).toEqual(["publisher"]);
	});

	it("has nothing to say about a root field", () => {
		expect(pathFieldNames(all, "")).toEqual([]);
	});

	it("keeps an unknown id rather than dropping it", () => {
		// A trail with a hole should look wrong, not look shorter.
		expect(pathFieldNames(all, "pub____gone")).toEqual(["publisher", "gone"]);
	});
});
