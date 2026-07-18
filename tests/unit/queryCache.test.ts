import { describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";
import { QueryCache } from "../../src/engine/queryCache";

// QueryCache never dereferences the App; a stub satisfies the type.
const stubApp = {} as App;

describe("QueryCache (§6)", () => {
	it("computes once and returns the cached value on repeat", async () => {
		const cache = new QueryCache(stubApp);
		const loader = vi.fn().mockResolvedValue(["default", "table"]);

		expect(await cache.resolve("X.base", "views", loader)).toEqual(["default", "table"]);
		expect(await cache.resolve("X.base", "views", loader)).toEqual(["default", "table"]);
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it("dedupes concurrent in-flight requests", async () => {
		const cache = new QueryCache(stubApp);
		let resolveFn!: (v: number) => void;
		const loader = vi.fn(() => new Promise<number>((r) => (resolveFn = r)));

		const p1 = cache.resolve("X.base", "rows", loader);
		const p2 = cache.resolve("X.base", "rows", loader);
		resolveFn(7);

		expect(await p1).toBe(7);
		expect(await p2).toBe(7);
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it("keeps subKeys independent within a base", async () => {
		const cache = new QueryCache(stubApp);
		await cache.resolve("X.base", "a", async () => 1);
		await cache.resolve("X.base", "b", async () => 2);
		expect(cache.has("X.base", "a")).toBe(true);
		expect(cache.has("X.base", "b")).toBe(true);
	});

	it("invalidate(path) drops every entry for that base only", async () => {
		const cache = new QueryCache(stubApp);
		await cache.resolve("X.base", "a", async () => 1);
		await cache.resolve("Y.base", "a", async () => 2);

		cache.invalidate("X.base");
		expect(cache.has("X.base")).toBe(false);
		expect(cache.has("Y.base")).toBe(true);
	});

	it("recomputes after invalidation", async () => {
		const cache = new QueryCache(stubApp);
		const loader = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

		expect(await cache.resolve("X.base", "v", loader)).toBe(1);
		cache.invalidate("X.base");
		expect(await cache.resolve("X.base", "v", loader)).toBe(2);
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it("does not cache rejected loads (retryable)", async () => {
		const cache = new QueryCache(stubApp);
		const loader = vi
			.fn()
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce("ok");

		await expect(cache.resolve("X.base", "v", loader)).rejects.toThrow("boom");
		expect(cache.has("X.base", "v")).toBe(false);
		expect(await cache.resolve("X.base", "v", loader)).toBe("ok");
		expect(loader).toHaveBeenCalledTimes(2);
	});
});
