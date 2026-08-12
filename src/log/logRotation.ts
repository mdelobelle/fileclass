/*
 * Keeping the schema log bounded (#159).
 *
 * A log nobody prunes is a log that eventually costs more to open than it is worth, and this one is
 * written by vault events — a busy month of renames can fill it without anybody noticing. So the
 * live file holds recent history and the rest moves to `<class folder>/.logs/archive_NNNN.log`.
 *
 * **Monotonic numbering**, and this is the whole design: the newest archive takes the next free
 * number, and pruning removes the lowest ones. Nothing is renamed on rotation — the alternative,
 * shifting every archive up by one, rewrites the entire history on every rotation and turns a
 * file's name into a lie about when it was written.
 *
 * Pure: the file names and the arithmetic are decided here and unit-tested; the reading and writing
 * is `schemaLog.ts`.
 */

/** Where archives live, relative to the class folder — a dot-folder, so it stays out of the way. */
export const ARCHIVE_DIR = ".logs";

const ARCHIVE_RE = /^archive_(\d{4,})\.log$/;

/** `archive_0007.log` — zero-padded so a directory listing sorts chronologically. */
export function archiveName(n: number): string {
	return `archive_${String(n).padStart(4, "0")}.log`;
}

/** The number an archive file name carries, or null when the name is not one of ours. */
export function archiveNumber(fileName: string): number | null {
	const match = ARCHIVE_RE.exec(fileName);
	return match ? Number(match[1]) : null;
}

/** The number the next archive should take: one past the highest that exists. */
export function nextArchiveNumber(fileNames: readonly string[]): number {
	const numbers = fileNames.map(archiveNumber).filter((n): n is number => n !== null);
	return numbers.length ? Math.max(...numbers) + 1 : 1;
}

/**
 * The archives to delete so that `keep` remain, oldest first.
 *
 * `keep` of 0 means the overflow is dropped rather than kept — a legitimate choice for someone who
 * wants the recent history and nothing else, and the only way to bound the disk cost absolutely.
 */
export function archivesToPrune(fileNames: readonly string[], keep: number): string[] {
	const ours = fileNames
		.map((name) => ({ name, n: archiveNumber(name) }))
		.filter((a): a is { name: string; n: number } => a.n !== null)
		.sort((a, b) => a.n - b.n);
	const excess = Math.max(0, ours.length - Math.max(0, keep));
	return ours.slice(0, excess).map((a) => a.name);
}

/**
 * Whether the live log has outgrown its cap.
 *
 * Counted in **entries**, not bytes: the cap is there so the window opens on a readable amount of
 * history, and "500 lines" is something a reader can picture where "64 kB" is not. A cap of 0 or
 * less turns rotation off.
 */
export function shouldRotate(entryCount: number, maxEntries: number): boolean {
	return maxEntries > 0 && entryCount > maxEntries;
}
