import { describe, expect, it } from "vitest";

import { extractPastedPair, parsePastedLocation } from "../../src/fields/location";

const EIFFEL = { lat: 48.8584, lon: 2.2945 };

describe("parsePastedLocation — what people actually paste", () => {
	it("reads the canonical pair we store", () => {
		expect(parsePastedLocation("48.8584,2.2945")).toEqual(EIFFEL);
		expect(parsePastedLocation(" 48.8584, 2.2945 ")).toEqual(EIFFEL);
	});

	it("reads a Google Maps link, with or without a place in the path", () => {
		expect(parsePastedLocation("https://www.google.com/maps/@48.8584,2.2945,17z")).toEqual(EIFFEL);
		expect(
			parsePastedLocation("https://www.google.com/maps/place/Tour+Eiffel/@48.8584,2.2945,17z/data=!3m1")
		).toEqual(EIFFEL);
		expect(parsePastedLocation("https://maps.google.com/?q=48.8584,2.2945")).toEqual(EIFFEL);
	});

	it("reads an Apple Maps link and a geo: URI", () => {
		expect(parsePastedLocation("https://maps.apple.com/?ll=48.8584,2.2945")).toEqual(EIFFEL);
		expect(parsePastedLocation("geo:48.8584,2.2945")).toEqual(EIFFEL);
		expect(parsePastedLocation("geo:48.8584,2.2945;u=35")).toEqual(EIFFEL);
	});

	it("reads OpenStreetMap's own two shapes", () => {
		expect(parsePastedLocation("https://www.openstreetmap.org/?mlat=48.8584&mlon=2.2945")).toEqual(EIFFEL);
		expect(parsePastedLocation("https://www.openstreetmap.org/#map=15/48.8584/2.2945")).toEqual(EIFFEL);
	});

	it("reads degrees and hemispheres, which is how a page displays them", () => {
		expect(parsePastedLocation("48.8584° N, 2.2945° E")).toEqual(EIFFEL);
		expect(parsePastedLocation("48.8584 N 2.2945 E")).toEqual(EIFFEL);
		// South and West are negative however they are written.
		expect(parsePastedLocation("33.8688° S, 151.2093° W")).toEqual({ lat: -33.8688, lon: -151.2093 });
	});

	it("reads a plain space- or semicolon-separated pair", () => {
		expect(parsePastedLocation("48.8584 2.2945")).toEqual(EIFFEL);
		expect(parsePastedLocation("48.8584; 2.2945")).toEqual(EIFFEL);
	});

	it("refuses what isn't a coordinate pair", () => {
		expect(parsePastedLocation("")).toBeNull();
		expect(parsePastedLocation("the library on 5th, open until 7")).toBeNull();
		expect(parsePastedLocation("48.8584")).toBeNull();
		expect(parsePastedLocation("1,2,3")).toBeNull();
		// Out of range is refused rather than stored and flagged later.
		expect(parsePastedLocation("91.0, 2.2945")).toBeNull();
		expect(parsePastedLocation("48.8584, 181")).toBeNull();
	});
});

describe("extractPastedPair — reading without judging the range", () => {
	it("returns the pair so the caller can say which mistake it is", () => {
		expect(extractPastedPair("91, 2.2945")).toEqual({ lat: 91, lon: 2.2945 });
		expect(parsePastedLocation("91, 2.2945")).toBeNull();
	});

	it("still refuses text that holds no pair at all", () => {
		expect(extractPastedPair("the library on 5th, open until 7")).toBeNull();
	});
});
