import { afterEach, describe, expect, it } from "vitest";

import type FileclassPlugin from "../../main";
import {
	clearPlugin,
	getPlugin,
	hasPlugin,
	setPlugin,
} from "../../src/globals";

// A minimal stand-in; globals never dereferences the plugin, only stores it.
const fakePlugin = { app: {} } as unknown as FileclassPlugin;

afterEach(() => clearPlugin());

describe("globals singleton (D7)", () => {
	it("throws when accessed before setPlugin", () => {
		expect(() => getPlugin()).toThrow(/before load or after unload/);
		expect(hasPlugin()).toBe(false);
	});

	it("returns the registered plugin after setPlugin", () => {
		setPlugin(fakePlugin);
		expect(hasPlugin()).toBe(true);
		expect(getPlugin()).toBe(fakePlugin);
	});

	it("throws again after clearPlugin", () => {
		setPlugin(fakePlugin);
		clearPlugin();
		expect(hasPlugin()).toBe(false);
		expect(() => getPlugin()).toThrow();
	});
});
