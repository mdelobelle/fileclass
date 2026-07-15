/**
 * basesAdapter — the ONLY module allowed to touch the core Bases plugin's
 * private internals (see ARCHITECTURE.md §3.1, D4).
 *
 * The logic of getBaseFiles/getBaseRows is a faithful TypeScript port of
 * functions proven at runtime against Obsidian 1.13.2 (July 2026), validated
 * by comparing outputs with a really-rendered Bases view (identical results,
 * incl. multi-view filters, `this.file` context, sort, groupBy, limit).
 * Do NOT refactor the sequence of private calls without re-running the
 * verification protocol (ARCHITECTURE.md §14, canary tests).
 *
 * Key invariants relied upon (all observed, none guessed):
 * - `app.embedRegistry.embedByExtension['base']` creates an embed whose
 *   constructor builds a QueryController without any workspace leaf.
 * - `embed.loadQuery()` = vault.read + Query.fromString → pure read.
 * - NEVER call `controller.setQuery()` headless: runQuery suspends until the
 *   container is shown (`isShown = !!offsetParent`). Assign `controller.query`
 *   directly instead.
 * - The BasesContext constructor creates an Entry when given a file, which is
 *   the only way to reach the (minified) Entry class.
 * - The dataset constructor already applies sort + limit; `ds.groupedData`
 *   groups the sorted flow (keyless group last).
 * - Empty values are a null-value singleton (toString() === "null"), detected
 *   by identity via a probe on a nonexistent property.
 */

import { App, TFile } from "obsidian";

// ---------------------------------------------------------------------------
// Structural typings for Bases private internals (minified names — we only
// type the members we use; everything else stays out of reach on purpose).
// ---------------------------------------------------------------------------

/** Value object returned by entry.getValue(); minified class, only toString is stable. */
export interface BasesValue {
    toString(): string;
}

/** Per-file query entry. `getValue` accepts 'note.x' | 'file.x' | 'formula.x' identifiers. */
export interface BasesEntry {
    file: TFile;
    getValue(identifier: string): BasesValue | null;
}

interface BasesViewConfig {
    name: string;
    type: string;
    filters: unknown;
    groupBy?: { property: string; direction: string };
    getOrder(): string[];
    getSort(): { property: string; direction: string }[];
    getLimit(): number;
}

interface BasesQuery {
    views: BasesViewConfig[];
    filters: unknown;
    formulas: Record<string, unknown>;
    getViewConfig(viewName: string | null): BasesViewConfig | null;
}

interface BasesContext {
    filter: { test(entry: BasesEntry): boolean } | null;
    constructor: new (
        app: App,
        filter: unknown,
        formulas: Record<string, unknown>,
        currentFile: TFile | null
    ) => BasesContext & { _local: BasesEntry | null };
}

interface QueryController {
    query: BasesQuery | null;
    viewName: string | null;
    currentFile: TFile | null;
    ctx: BasesContext | null;
    results: Map<TFile, BasesEntry>;
    view: unknown;
    viewContainerEl: HTMLElement;
    initialScan: boolean;
    buildBasesContext(viewFilters: unknown): BasesContext;
    notifyView(): void;
}

interface BasesEmbed {
    controller: QueryController;
    loadQuery(): Promise<BasesQuery>;
}

interface BasesDatasetGroup {
    key: unknown;
    entries: BasesEntry[];
    hasKey(): boolean;
}

interface BasesDataset {
    properties: string[];
    data: BasesEntry[];
    groupedData: BasesDatasetGroup[];
}

type EmbedCreator = (
    context: { app: App; containerEl: HTMLElement; sourcePath: string },
    file: TFile,
    subpath: string
) => BasesEmbed;

interface BasesViewRegistration {
    name: string;
    icon: string;
    factory: (controller: QueryController, containerEl: HTMLElement) => unknown;
    options?: () => unknown[];
}

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export interface BaseRow {
    file: TFile;
    /** toString() of each `order` column value; null when the value is empty. */
    values: Record<string, string | null>;
    /** Raw entry for typed access: entry.getValue('file.ctime') etc. */
    entry: BasesEntry;
}

export interface BaseGroup {
    /** String form of the group key; null for the "no value" group (always last). */
    key: string | null;
    keyValue: unknown;
    rows: BaseRow[];
}

export interface BaseQueryResult {
    /** Validated column identifiers from the view's `order:` setting. */
    columns: string[];
    groupBy: { property: string; direction: string } | null;
    /** Flat rows, sorted per the view's `sort:` and truncated per its `limit:`. */
    rows: BaseRow[];
    /** Present only when the view defines `groupBy`. */
    groups: BaseGroup[] | null;
}

export class BasesUnavailableError extends Error {
    constructor(detail: string) {
        super(`Core Bases plugin unavailable or incompatible: ${detail}`);
        this.name = "BasesUnavailableError";
    }
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

function getEmbedCreator(app: App): EmbedCreator | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creator = (app as any).embedRegistry?.embedByExtension?.["base"];
    return typeof creator === "function" ? (creator as EmbedCreator) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBasesInstance(app: App): any | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (app as any).internalPlugins?.getPluginById?.("bases")?.instance ?? null;
}

/** True when the Bases plugin is enabled and the internals we rely on are present. */
export function isBasesAvailable(app: App): boolean {
    const instance = getBasesInstance(app);
    return (
        getEmbedCreator(app) !== null &&
        instance !== null &&
        typeof instance.getViewFactory === "function"
    );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function createHeadlessController(
    app: App,
    basePath: string
): Promise<{ embed: BasesEmbed; query: BasesQuery; baseFile: TFile }> {
    const baseFile = app.vault.getFileByPath(basePath);
    if (!baseFile) throw new Error(`Base file not found: ${basePath}`);
    const creator = getEmbedCreator(app);
    if (!creator) throw new BasesUnavailableError("embedRegistry has no 'base' handler");
    // Detached container: never inserted in the DOM, garbage-collected with the embed.
    const embed = creator({ app, containerEl: createDiv(), sourcePath: basePath }, baseFile, "");
    const query = await embed.loadQuery();
    return { embed, query, baseFile };
}

function resolveViewConfig(query: BasesQuery, viewName: string | null | undefined): BasesViewConfig {
    const cfg = query.getViewConfig(viewName ?? null);
    if (!cfg) {
        const available = query.views.map((v) => v.name).join(", ");
        throw new Error(`View not found: "${viewName}" (available: ${available})`);
    }
    return cfg;
}

function resolveContextFile(app: App, contextFilePath: string | null | undefined): TFile | null {
    if (!contextFilePath) return null;
    const ctxFile = app.vault.getFileByPath(contextFilePath);
    if (!ctxFile) throw new Error(`Context file not found: ${contextFilePath}`);
    return ctxFile;
}

/** Entry class is minified: the only reliable handle is the ctx constructor's `_local` trick. */
function getEntryClass(
    app: App,
    ctx: BasesContext,
    anyFile: TFile
): new (ctx: BasesContext, file: TFile) => BasesEntry {
    const Ctx = ctx.constructor;
    const probe = new Ctx(app, null, {}, anyFile);
    if (!probe._local) throw new BasesUnavailableError("context no longer builds a local entry");
    return probe._local.constructor as new (ctx: BasesContext, file: TFile) => BasesEntry;
}

/** Replicates the plugin's own runQuery filtering loop, minus the DOM gate. */
function collectMatchingEntries(
    app: App,
    ctx: BasesContext,
    EntryCls: new (ctx: BasesContext, file: TFile) => BasesEntry
): Map<TFile, BasesEntry> {
    const results = new Map<TFile, BasesEntry>();
    for (const f of app.vault.getFiles()) {
        if (app.metadataCache.isUserIgnored(f.path)) continue;
        try {
            const entry = new EntryCls(ctx, f);
            if (!ctx.filter || ctx.filter.test(entry)) results.set(f, entry);
        } catch (e) {
            // Native behavior: files whose filter evaluation throws are excluded.
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Names of the views defined in a .base file, in file order (first = default). */
export async function listBaseViews(app: App, basePath: string): Promise<string[]> {
    const { query } = await createHeadlessController(app, basePath);
    return query.views.map((v) => v.name);
}

/**
 * Runs the query of a .base view headless (no leaf, no rendering, no DOM
 * attachment) and returns the matching files.
 *
 * @param basePath        vault path of the .base file
 * @param viewName        falsy → first view of the base
 * @param contextFilePath host file resolving `this.file` in filters/formulas
 * @returns unordered set of matching files (the view's `sort:` is a display
 *          concern; use getBaseRows for sorted results)
 */
export async function getBaseFiles(
    app: App,
    basePath: string,
    viewName?: string | null,
    contextFilePath?: string | null
): Promise<TFile[]> {
    const { embed, query, baseFile } = await createHeadlessController(app, basePath);
    const cfg = resolveViewConfig(query, viewName);
    // Direct assignment on purpose — setQuery() would trigger rendering (see header).
    embed.controller.query = query;
    embed.controller.currentFile = resolveContextFile(app, contextFilePath);
    const ctx = embed.controller.buildBasesContext(cfg.filters);
    const EntryCls = getEntryClass(app, ctx, baseFile);
    return [...collectMatchingEntries(app, ctx, EntryCls).keys()];
}

/**
 * Same as getBaseFiles but returns rows with the view's `order:` columns,
 * sorted per its `sort:`, limited per its `limit:`, grouped per its `groupBy`.
 * Sorting/grouping/limiting are performed by the Bases dataset itself (its
 * constructor applies them) — semantics identical to the rendered table view,
 * including link values compared by display text.
 */
export async function getBaseRows(
    app: App,
    basePath: string,
    viewName?: string | null,
    contextFilePath?: string | null
): Promise<BaseQueryResult> {
    const { embed, query, baseFile } = await createHeadlessController(app, basePath);
    const cfg = resolveViewConfig(query, viewName);
    const ctrl = embed.controller;
    ctrl.query = query;
    ctrl.viewName = cfg.name; // notifyView re-resolves the view config by name
    ctrl.currentFile = resolveContextFile(app, contextFilePath);
    const ctx = ctrl.buildBasesContext(cfg.filters);
    ctrl.ctx = ctx;
    const EntryCls = getEntryClass(app, ctx, baseFile);
    ctrl.results = collectMatchingEntries(app, ctx, EntryCls);

    // Headless table view in the controller's detached container: notifyView
    // evaluates relevant properties then builds the official dataset.
    const instance = getBasesInstance(app);
    const factory = instance?.getViewFactory?.("table");
    if (!factory) throw new BasesUnavailableError("no 'table' view factory");
    const view = factory(ctrl, ctrl.viewContainerEl);
    view.config = cfg;
    ctrl.view = view;
    ctrl.initialScan = false; // notifyView is a no-op while initialScan is true
    ctrl.notifyView();
    const ds: BasesDataset | undefined = view.data;
    if (!ds) throw new BasesUnavailableError("notifyView produced no dataset");

    const columns = ds.properties;
    // Empty values are a singleton, not JS null: capture it by identity.
    const nullSentinel = ds.data.length ? ds.data[0].getValue("note.__null_probe__") : null;
    const toRow = (entry: BasesEntry): BaseRow => {
        const values: Record<string, string | null> = {};
        for (const id of columns) {
            let v: BasesValue | null = null;
            try {
                v = entry.getValue(id);
            } catch (e) {
                /* column unreadable for this file → null */
            }
            values[id] = v == null || v === nullSentinel ? null : v.toString();
        }
        return { file: entry.file, values, entry };
    };

    return {
        columns,
        groupBy: cfg.groupBy ?? null,
        rows: ds.data.map(toRow), // already sorted + limited by the dataset ctor
        groups: cfg.groupBy
            ? ds.groupedData.map((g) => ({
                  key: g.hasKey() ? String(g.key) : null,
                  keyValue: g.hasKey() ? g.key : null,
                  rows: g.entries.map(toRow),
              }))
            : null,
    };
}

/**
 * Registers a custom Bases view type (e.g. the editable "fileclass-table",
 * ARCHITECTURE.md §11). Returns an unregister function to call on plugin unload.
 */
export function registerFileclassView(
    app: App,
    viewId: string,
    registration: BasesViewRegistration
): () => void {
    const instance = getBasesInstance(app);
    if (!instance || typeof instance.registerView !== "function") {
        throw new BasesUnavailableError("registerView not available");
    }
    instance.registerView(viewId, registration);
    return () => {
        try {
            instance.deregisterView?.(viewId);
        } catch (e) {
            /* plugin may already be unloaded */
        }
    };
}
