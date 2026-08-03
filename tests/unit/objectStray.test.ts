import { describe, expect, it } from "vitest";

import { Field } from "../../src/schema/field";
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
