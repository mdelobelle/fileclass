/*
 * queryCache — memoizes expensive per-.base results (parsed queries, view
 * lists, row scans) so repeated reads of the same base don't re-run the
 * O(vault) adapter scan (ARCHITECTURE.md §6).
 *
 * Keyed by (basePath, subKey): a base may be read under several views /
 * context files, each a distinct subKey, but they all invalidate together when
 * the .base file changes. `main.ts` owns the single instance and calls
 * `invalidate(path)` from `vault.on('modify')`.
 *
 * Only the adapter touches Bases internals; this module is engine-neutral and
 * caches whatever a loader returns. Its logic is pure and unit-tested (a stub
 * loader stands in for the adapter).
 */
import type { App } from "obsidian";

type Pending<T> = Promise<T>;

export class QueryCache {
	/** basePath → (subKey → in-flight-or-settled promise). */
	private readonly store = new Map<string, Map<string, Pending<unknown>>>();

	constructor(readonly app: App) {}

	/**
	 * Returns the cached value for (`basePath`, `subKey`), computing it via
	 * `loader` on first request. Concurrent requests for the same key share one
	 * in-flight promise (no duplicate scans). A rejected load is not cached: the
	 * next call retries.
	 */
	resolve<T>(basePath: string, subKey: string, loader: () => Promise<T>): Promise<T> {
		let bucket = this.store.get(basePath);
		if (!bucket) {
			bucket = new Map();
			this.store.set(basePath, bucket);
		}
		const existing = bucket.get(subKey) as Pending<T> | undefined;
		if (existing) return existing;

		const promise = loader().catch((err) => {
			// Do not cache failures — evict so a retry can re-run the loader.
			if (bucket?.get(subKey) === promise) bucket.delete(subKey);
			throw err;
		});
		bucket.set(subKey, promise);
		return promise;
	}

	/** Drops every cached entry for a base (call when its .base file changes). */
	invalidate(basePath: string): void {
		this.store.delete(basePath);
	}

	/** True if any entry is currently cached for the base (test/introspection). */
	has(basePath: string, subKey?: string): boolean {
		const bucket = this.store.get(basePath);
		if (!bucket) return false;
		return subKey === undefined ? bucket.size > 0 : bucket.has(subKey);
	}

	/** Empties the entire cache. */
	clear(): void {
		this.store.clear();
	}

	/** Releases all cached state; called on plugin unload. */
	dispose(): void {
		this.clear();
	}
}
