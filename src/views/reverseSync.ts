/*
 * Finding a note's reverse relations and putting one on the page (#154) — the app-facing half.
 *
 * Three impure jobs, in the order the feature performs them:
 *  1. **discover** which relations point at this note, by asking each link field's own source view
 *     whether the note is one of its candidates;
 *  2. **author** the view in the target class's base, once for every host that will ever use it;
 *  3. **place** the embed in the note, at the cursor when there is one.
 *
 * The rules — the filter, the view's name, the reuse test, where an embed already is — are next
 * door in `reverseView.ts`, with the tests. This file only touches Obsidian.
 */
import { MarkdownView, Notice, TFile, normalizePath, parseYaml, stringifyYaml } from "obsidian";

import type FileclassPlugin from "../../main";
import { getBaseFiles } from "../engine/basesAdapter";
import { ChoiceSuggestModal } from "../fields/input/valueModals";
import { baseBindingOptionsFromOptions } from "../fields/options";
import { logEvent } from "../log/schemaLog";
import { isRootField } from "../schema/field";
import { toRelatedViews } from "../schema/fileClass";
import {
	classScope,
	confirmCloseOpenBase,
	detachAndAwaitSave,
	managedViewName,
	openBaseLeaves,
} from "./baseSync";
import { mirrorOrder } from "./baseYaml";
import { pickReverseBase } from "./reverseBaseModal";
import {
	LinkCardinality,
	addReverseView,
	appendEmbed,
	findEmbedLine,
	formatViewRef,
	relatedViewsFor,
	withRelatedView,
	linkCardinality,
	reverseEmbed,
	reverseOrder,
	reverseViewFilter,
	reverseViewName,
	viewOrder,
} from "./reverseView";

/** One relation that can be read backwards from the note being looked at. */
export interface ReverseCandidate {
	/** The class whose notes do the pointing — `Book` in "the books by this author". */
	targetClass: string;
	fieldName: string;
	cardinality: LinkCardinality;
	/** The view that made this note a candidate, kept for the notice and for debugging. */
	sourceBase: string;
	sourceView: string;
}

/** `Book.author` — how a candidate names itself in a picker. */
export function candidateLabel(c: ReverseCandidate): string {
	return `${c.targetClass}.${c.fieldName}`;
}

/**
 * The relations pointing at `host`, derived from the schema alone.
 *
 * A field qualifies when it holds links **and** draws its candidates from a base view — that
 * binding *is* the declared relation. A `File` field with no binding accepts any note in the
 * vault, which would make every class a candidate from every note; a `Select` holding an author's
 * name is not a relation at all, since nothing resolves it to a file (see `linkCardinality`).
 *
 * Membership is the source view's own answer, not a guess: whatever scope, filter and sort the
 * author gave `Authors.base#All authors`, a note it does not return is not an author. Results are
 * memoised per (base, view) in `QueryCache`, so ten fields sharing one source view cost one
 * O(vault) scan, and the cache drops on that base's next modify.
 *
 * Root fields only. A link nested inside an `Object` would need a dotted property path in the
 * filter, which is a different notation with its own quoting rules — out of scope, and documented.
 */
export async function reverseCandidates(
	plugin: FileclassPlugin,
	host: TFile
): Promise<ReverseCandidate[]> {
	const out: ReverseCandidate[] = [];
	if (!plugin.basesAvailable) return out;

	for (const targetClass of [...plugin.index.fileClassNames].sort((a, b) => a.localeCompare(b))) {
		// Resolved, not own: a class inheriting `author` from Media points at authors too.
		for (const field of plugin.index.getResolvedFields(targetClass)) {
			if (!isRootField(field)) continue;
			const cardinality = linkCardinality(field.type);
			if (!cardinality) continue;
			const binding = baseBindingOptionsFromOptions(field.options);
			if (!binding.baseFile) continue;
			const sourceBase = normalizePath(binding.baseFile);
			const sourceView = binding.viewName ?? "";
			if (await isCandidateOf(plugin, sourceBase, sourceView, host)) {
				out.push({
					targetClass,
					fieldName: field.name,
					cardinality,
					sourceBase,
					sourceView,
				});
			}
		}
	}
	return out;
}

/** Whether `host` is one of the files the source view returns. */
async function isCandidateOf(
	plugin: FileclassPlugin,
	basePath: string,
	viewName: string,
	host: TFile
): Promise<boolean> {
	try {
		const paths = await plugin.queryCache.resolve(basePath, `reverse:${viewName}`, async () => {
			// No context file: a source view is a catalogue of candidates, and one that depended on
			// the note it is read from could not be a catalogue at all.
			const files = await getBaseFiles(plugin.app, basePath, viewName || undefined, null);
			return new Set(files.map((f) => f.path));
		});
		return paths.has(host.path);
	} catch {
		// A base that cannot be read yields no candidate, silently: this runs over every class on
		// every invocation, and one broken base must not bury the answer under notices.
		return false;
	}
}

/** The base offered by default: the class's own, else one named after it in the bases folder. */
export function defaultBasePath(plugin: FileclassPlugin, targetClass: string): string {
	const declared = plugin.index.getFileClass(targetClass)?.options.baseFile?.trim();
	return normalizePath(declared || `${plugin.settings.basesFolder}${targetClass}.base`);
}

/**
 * The view this class declares for `field`, if it declares one.
 *
 * **Declared, not recognised.** The view belongs to whoever named it — `A's Bs` is as good a name as
 * `Book by author`, and better if two thousand notes already embed it — so the class says which view
 * reads which field backwards, and nothing here consults a name. A rename then changes nothing at
 * all, which is the whole point of writing it down.
 */
export function declaredReverseViews(
	plugin: FileclassPlugin,
	targetClass: string,
	field: string
): ReverseViewRef[] {
	const declared = plugin.index.getFileClass(targetClass)?.options.relatedViews ?? [];
	return relatedViewsFor(declared, field).map((ref) => ({
		path: normalizePath(ref.path),
		viewName: ref.viewName,
	}));
}

/**
 * Asks which of a field's declared views this note should embed.
 *
 * `null` when the reader closes the question — the same as declining, and nothing is written.
 */
function pickDeclaredView(
	plugin: FileclassPlugin,
	views: ReverseViewRef[],
	candidate: ReverseCandidate
): Promise<ReverseViewRef | null> {
	return new Promise((resolve) => {
		let answered = false;
		const modal = new ChoiceSuggestModal<ReverseViewRef>(
			plugin.app,
			views,
			(v) => `${v.viewName} — ${v.path}`,
			(v) => {
				answered = true;
				resolve(v);
			},
			`Which view of ${candidate.targetClass} › ${candidate.fieldName}?`
		);
		// A SuggestModal closes before it calls the choose handler, so the close hook fires first
		// on a pick; the answer is settled a tick later.
		const close = modal.onClose.bind(modal);
		modal.onClose = () => {
			close();
			window.setTimeout(() => {
				if (!answered) resolve(null);
			}, 0);
		};
		modal.open();
	});
}

/** Writes the declaration onto the class note, so the next note finds the same view. */
async function declareReverseView(
	plugin: FileclassPlugin,
	targetClass: string,
	field: string,
	ref: ReverseViewRef
): Promise<void> {
	const note = plugin.index.getFileClassFile(targetClass);
	if (!(note instanceof TFile)) return;
	await plugin.app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
		// Added, not replaced: a field may be read backwards by several views.
		fm.relatedViews = withRelatedView(
			toRelatedViews(fm.relatedViews),
			field,
			formatViewRef(ref.path, ref.viewName)
		);
	});
}

/**
 * The columns of the class's own table, read from **its** base wherever the reverse view is going.
 *
 * The shape belongs to the class, not to the file that happens to hold the new view: a reverse view
 * sent to a dashboard base should still look like the Book table the reader curated in `Books.base`.
 * Null when the class has no base, or no managed view in it.
 */
async function managedColumns(plugin: FileclassPlugin, targetClass: string): Promise<string[] | null> {
	const file = plugin.app.vault.getFileByPath(defaultBasePath(plugin, targetClass));
	if (!(file instanceof TFile)) return null;
	try {
		const base = (parseYaml(await plugin.app.vault.read(file)) ?? {}) as Record<string, unknown>;
		return viewOrder(base, managedViewName(plugin, targetClass));
	} catch {
		return null;
	}
}

/** A reverse view, and the base it lives in. */
export interface ReverseViewRef {
	path: string;
	viewName: string;
}

/**
 * The reverse view for `candidate` — found where it already is, or created where the reader says.
 *
 * Reuse is the normal outcome, not an optimisation: `this.file` in an embedded base resolves to
 * the host note (ARCHITECTURE §3.1), so the view the first author created answers for every other
 * one. Creating one view per host would be the bug this design exists to avoid — which is also why
 * the reader is asked **only** on the run that creates it: there is nothing to decide afterwards,
 * and asking again would invite a second copy somewhere else.
 */
export async function ensureReverseView(
	plugin: FileclassPlugin,
	candidate: ReverseCandidate
): Promise<ReverseViewRef | null> {
	const app = plugin.app;
	const viewName = reverseViewName(candidate.targetClass, candidate.fieldName);

	const declared = declaredReverseViews(plugin, candidate.targetClass, candidate.fieldName);
	if (declared.length === 1) return declared[0];
	// Several views read this field backwards, and only the reader knows which one this note wants
	// embedded — "Delegate's ongoing tasks" or "Delegate's done tasks". Guessing would be silent.
	if (declared.length > 1) return await pickDeclaredView(plugin, declared, candidate);

	const path = await pickReverseBase(
		plugin,
		viewName,
		candidate.targetClass,
		defaultBasePath(plugin, candidate.targetClass)
	);
	if (!path) return null;

	const filter = reverseViewFilter(
		classScope(plugin, candidate.targetClass),
		candidate.fieldName,
		candidate.cardinality
	);
	// The shape the reader chose for these notes in the class's own table — every column they
	// removed included — falling back to the class's fields when there is no such table.
	const columns =
		(await managedColumns(plugin, candidate.targetClass)) ??
		mirrorOrder(
			plugin.index
				.getResolvedFields(candidate.targetClass)
				.filter((f) => isRootField(f))
				.map((f) => f.name)
		);
	const order = reverseOrder(columns, candidate.fieldName);

	const file = app.vault.getFileByPath(path);
	if (!(file instanceof TFile)) {
		await ensureParentFolder(plugin, path);
		await app.vault.create(path, stringifyYaml({ views: [] }));
		const created = app.vault.getFileByPath(path);
		if (!(created instanceof TFile)) {
			new Notice(`Fileclass: could not create ${path}.`);
			return null;
		}
		const base = { views: [] as unknown[] };
		addReverseView(base, viewName, filter, order);
		await app.vault.modify(created, stringifyYaml(base));
		await declareReverseView(plugin, candidate.targetClass, candidate.fieldName, { path, viewName });
		new Notice(`Fileclass: created ${path} with "${viewName}".`);
		void logEvent(plugin, "INFO", "views.reverse-created", `${candidate.targetClass}: created ${path} › ${viewName}`, {
			fileClass: candidate.targetClass,
			field: candidate.fieldName,
			base: path,
			view: viewName,
		});
		return { path, viewName };
	}

	// Bases holds an open base's layout in memory and writes it back over ours; every write path
	// in this plugin takes the same precaution.
	const openLeaves = openBaseLeaves(app, file.path);
	if (openLeaves.length) {
		if (!(await confirmCloseOpenBase(app, file.name))) {
			new Notice(`Fileclass: "${file.name}" is open — close it, then try again.`);
			return null;
		}
		await detachAndAwaitSave(app, file, openLeaves);
	}

	try {
		const base = (parseYaml(await app.vault.read(file)) ?? {}) as { views?: unknown };
		if (addReverseView(base, viewName, filter, order) === "added") {
			await app.vault.modify(file, stringifyYaml(base));
			new Notice(`Fileclass: "${viewName}" ready in ${file.name}.`);
			void logEvent(plugin, "INFO", "views.reverse-created", `${candidate.targetClass}: added "${viewName}" to ${file.path}`, {
				fileClass: candidate.targetClass,
				field: candidate.fieldName,
				base: file.path,
				view: viewName,
			});
		}
		await declareReverseView(plugin, candidate.targetClass, candidate.fieldName, {
			path: file.path,
			viewName,
		});
		return { path: file.path, viewName };
	} catch (err) {
		new Notice(`Fileclass: could not update ${file.name} (${(err as Error).message}).`);
		return null;
	}
}

async function ensureParentFolder(plugin: FileclassPlugin, path: string): Promise<void> {
	const parent = path.split("/").slice(0, -1).join("/");
	if (parent && !plugin.app.vault.getFolderByPath(parent)) {
		await plugin.app.vault.createFolder(parent).catch(() => undefined);
	}
}

/**
 * Puts the embed in `host` — at the cursor when its editor is open, appended otherwise.
 *
 * An embed already there is never rewritten or duplicated: the reader is taken to it instead. The
 * line it sits on is the reader's, and so is everything around it.
 */
export async function placeEmbed(
	plugin: FileclassPlugin,
	host: TFile,
	basePath: string,
	viewName: string
): Promise<void> {
	const app = plugin.app;
	const embed = reverseEmbed(basePath, viewName);
	const editor = activeEditorFor(plugin, host);

	const body = editor ? editor.editor.getValue() : await app.vault.read(host);
	const existing = findEmbedLine(body, basePath, viewName);
	if (existing >= 0) {
		if (editor) editor.editor.setCursor({ line: existing, ch: 0 });
		new Notice(`Fileclass: "${viewName}" is already on this note.`);
		return;
	}

	if (editor) {
		// At the cursor, which is where someone who just asked for a block expects it. A blank line
		// after, so the next paragraph is not swallowed into the embed's line.
		const cursor = editor.editor.getCursor();
		const atLineStart = cursor.ch === 0;
		editor.editor.replaceRange(atLineStart ? `${embed}\n\n` : `\n\n${embed}\n`, cursor);
		new Notice(`Fileclass: added "${viewName}".`);
		return;
	}

	const { body: next } = appendEmbed(body, embed);
	await app.vault.modify(host, next);
	new Notice(`Fileclass: added "${viewName}" to ${host.basename}.`);
}

/**
 * Whether any class could ever point at anything — a synchronous look at the index.
 *
 * The menu is built while the right-click is happening, and discovery is O(vault) per source view,
 * so the entry cannot be offered on evidence: this only asks whether the vault declares a single
 * bound link field, which costs nothing and hides the entry in a vault with no relations at all.
 */
export function vaultHasReverseRelations(plugin: FileclassPlugin): boolean {
	return plugin.index.fileClassNames.some((name) =>
		plugin.index
			.getResolvedFields(name)
			.some(
				(f) =>
					isRootField(f) &&
					linkCardinality(f.type) !== null &&
					!!baseBindingOptionsFromOptions(f.options).baseFile
			)
	);
}

/**
 * The whole gesture: discover, choose when there is a choice, author the view, place the embed.
 *
 * Discovery runs **here and nowhere else** — never on note open, never on an index rebuild (§6).
 * The cost is bounded because the reader asked for it.
 */
export async function insertReverseRelation(plugin: FileclassPlugin, host: TFile): Promise<void> {
	const notice = new Notice("Fileclass: looking for relations pointing here…", 0);
	let candidates: ReverseCandidate[];
	try {
		candidates = await reverseCandidates(plugin, host);
	} finally {
		notice.hide();
	}

	if (!candidates.length) {
		// Said in terms of the schema, since that is what decides: being linked from a note is not
		// the same as being a candidate of a class's field.
		new Notice(
			`Fileclass: no class field takes ${host.basename} as a candidate, so there is no relation to read backwards.`
		);
		return;
	}
	if (candidates.length === 1) {
		await applyReverseRelation(plugin, host, candidates[0]);
		return;
	}
	new ChoiceSuggestModal<ReverseCandidate>(
		plugin.app,
		candidates,
		(c) => candidateLabel(c),
		(c) => void applyReverseRelation(plugin, host, c),
		`Which relation to show on ${host.basename}?`
	).open();
}

async function applyReverseRelation(
	plugin: FileclassPlugin,
	host: TFile,
	candidate: ReverseCandidate
): Promise<void> {
	const view = await ensureReverseView(plugin, candidate);
	if (!view) return;
	await placeEmbed(plugin, host, view.path, view.viewName);
}

/** The open Markdown editor showing `host` in edit mode, if there is one. */
function activeEditorFor(plugin: FileclassPlugin, host: TFile): MarkdownView | null {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || view.file?.path !== host.path) return null;
	// Reading mode has no cursor and no editor to write through; the vault path handles it.
	return view.getMode() === "source" ? view : null;
}
