import { describe, expect, it } from "vitest";

import {
	formatLocation,
	inRange,
	isValidLocation,
	mapUrl,
	parseLocation,
} from "../../src/fields/location";

describe("parseLocation", () => {
	it("parses a lat,lon pair (with optional spaces)", () => {
		expect(parseLocation("48.8566,2.3522")).toEqual({ lat: 48.8566, lon: 2.3522 });
		expect(parseLocation(" 48.8566 , 2.3522 ")).toEqual({ lat: 48.8566, lon: 2.3522 });
		expect(parseLocation("-33.8688,151.2093")).toEqual({ lat: -33.8688, lon: 151.2093 });
	});
	it("rejects malformed input", () => {
		expect(parseLocation("")).toBeNull();
		expect(parseLocation("48.8566")).toBeNull(); // one number
		expect(parseLocation("48.8566,2.3522,3")).toBeNull(); // three
		expect(parseLocation("48.8566,")).toBeNull(); // empty part
		expect(parseLocation("a,b")).toBeNull();
	});
});

describe("inRange / isValidLocation", () => {
	it("enforces lat ∈ [-90,90], lon ∈ [-180,180]", () => {
		expect(inRange({ lat: 90, lon: -180 })).toBe(true);
		expect(inRange({ lat: 91, lon: 0 })).toBe(false);
		expect(inRange({ lat: 0, lon: 181 })).toBe(false);
	});
	it("isValidLocation combines parse + range", () => {
		expect(isValidLocation("48.8566,2.3522")).toBe(true);
		expect(isValidLocation("100,2")).toBe(false); // lat out of range
		expect(isValidLocation("nope")).toBe(false);
	});
});

describe("formatLocation", () => {
	it("joins as a spaceless lat,lon scalar", () => {
		expect(formatLocation(48.8566, 2.3522)).toBe("48.8566,2.3522");
	});
});

describe("mapUrl", () => {
	it("builds an OpenStreetMap URL for valid coordinates", () => {
		expect(mapUrl("48.8566,2.3522")).toBe(
			"https://www.openstreetmap.org/?mlat=48.8566&mlon=2.3522#map=15/48.8566/2.3522"
		);
	});
	it("returns null for invalid coordinates", () => {
		expect(mapUrl("999,999")).toBeNull();
		expect(mapUrl("nope")).toBeNull();
	});
});
