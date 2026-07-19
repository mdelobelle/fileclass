/*
 * Interactive terminal UI (ink). Navigate fileClasses → notes → fields and edit
 * a value with typed input, all against the live plugin API (via the same
 * transport as the CLI). List and text-input are hand-rolled on ink's useInput
 * to avoid companion-lib version churn.
 */
import { Box, render, Text, useApp, useInput } from "ink";
import { useEffect, useState, type ReactNode } from "react";

import { callApi } from "./transport.js";
import type { ExplainField, FileClassSummary, NoteExplain, NoteRow, WriteResult } from "./types.js";

const WINDOW = 15;
const CHOICE = new Set(["Select", "Cycle"]);
const TEXT = new Set(["Input", "Number", "Date", "DateTime", "Time"]);

interface Item {
	label: string;
	value: string;
}

const fmt = (v: unknown): string =>
	v === null || v === undefined ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v);

/** A scrolling, keyboard-driven single-select list. */
function List({ items, onSelect }: { items: Item[]; onSelect: (value: string) => void }) {
	const [i, setI] = useState(0);
	useInput((_input, key) => {
		if (key.upArrow) setI((x) => Math.max(0, x - 1));
		else if (key.downArrow) setI((x) => Math.min(items.length - 1, x + 1));
		else if (key.return && items[i]) onSelect(items[i].value);
	});
	if (!items.length) return <Text dimColor>(empty)</Text>;
	const start = Math.min(Math.max(0, i - Math.floor(WINDOW / 2)), Math.max(0, items.length - WINDOW));
	return (
		<Box flexDirection="column">
			{items.slice(start, start + WINDOW).map((it, idx) => {
				const real = start + idx;
				const sel = real === i;
				return (
					<Text key={it.value + real} color={sel ? "green" : undefined}>
						{sel ? "› " : "  "}
						{it.label}
					</Text>
				);
			})}
			<Text dimColor>
				{"  "}
				{i + 1}/{items.length}
			</Text>
		</Box>
	);
}

/** A minimal single-line text editor. */
function TextEdit({ initial, onSubmit }: { initial: string; onSubmit: (value: string) => void }) {
	const [val, setVal] = useState(initial);
	useInput((input, key) => {
		if (key.return) onSubmit(val);
		else if (key.backspace || key.delete) setVal((v) => v.slice(0, -1));
		else if (input && !key.ctrl && !key.meta) setVal((v) => v + input);
	});
	return (
		<Text>
			{val}
			<Text inverse> </Text>
		</Text>
	);
}

function Loading({ label }: { label: string }) {
	return <Text>Loading {label}…</Text>;
}

function FileClasses({ onPick }: { onPick: (fileClass: string) => void }) {
	const [items, setItems] = useState<Item[] | null>(null);
	const [err, setErr] = useState<string>();
	useEffect(() => {
		callApi<FileClassSummary[]>("listFileClasses")
			.then((fcs) =>
				setItems(
					[...fcs]
						.sort((a, b) => a.name.localeCompare(b.name))
						.map((f) => ({
							label: `${f.name}   ${f.fieldCount} field${f.fieldCount === 1 ? "" : "s"}${
								f.extends ? `  ⟵ ${f.extends}` : ""
							}`,
							value: f.name,
						}))
				)
			)
			.catch((e: Error) => setErr(e.message));
	}, []);
	if (err) return <Text color="red">{err}</Text>;
	if (!items) return <Loading label="fileClasses" />;
	return <List items={items} onSelect={onPick} />;
}

function Notes({ fileClass, onPick }: { fileClass: string; onPick: (note: string) => void }) {
	const [items, setItems] = useState<Item[] | null>(null);
	const [err, setErr] = useState<string>();
	useEffect(() => {
		callApi<NoteRow[]>("listNotes", [fileClass, { columns: [] }])
			.then((rows) => setItems(rows.map((r) => ({ label: r.path, value: r.path }))))
			.catch((e: Error) => setErr(e.message));
	}, [fileClass]);
	if (err) return <Text color="red">{err}</Text>;
	if (!items) return <Loading label={`${fileClass} notes`} />;
	return <List items={items} onSelect={onPick} />;
}

function Fields({ note, onPick }: { note: string; onPick: (field: ExplainField) => void }) {
	const [ex, setEx] = useState<NoteExplain | null>(null);
	const [err, setErr] = useState<string>();
	useEffect(() => {
		callApi<NoteExplain | null>("explain", [note])
			.then((e) => setEx(e ?? { path: note, fileClasses: [], ancestry: [], fields: [] }))
			.catch((e: Error) => setErr(e.message));
	}, [note]);
	if (err) return <Text color="red">{err}</Text>;
	if (!ex) return <Loading label="fields" />;
	const items = ex.fields.map((f) => ({
		label: `${f.name} = ${f.display || fmt(f.value)}   [${f.type}]`,
		value: f.name,
	}));
	return (
		<List
			items={items}
			onSelect={(v) => {
				const field = ex.fields.find((f) => f.name === v);
				if (field) onPick(field);
			}}
		/>
	);
}

function Edit({
	note,
	field,
	onDone,
}: {
	note: string;
	field: ExplainField;
	onDone: (message: string) => void;
}) {
	const [allowed, setAllowed] = useState<string[] | null>(null);
	const isChoice = CHOICE.has(field.type);
	useEffect(() => {
		if (isChoice)
			callApi<string[]>("allowedValues", [note, field.name])
				.then(setAllowed)
				.catch(() => setAllowed([]));
	}, [isChoice, note, field.name]);

	const save = (value: unknown): void => {
		callApi<WriteResult>("setValue", [note, field.name, value])
			.then((r) => onDone(r.ok ? `✓ ${field.name} = ${fmt(value)}` : `✗ ${r.message}`))
			.catch((e: Error) => onDone(`✗ ${e.message}`));
	};

	if (field.type === "Boolean") {
		return (
			<Box flexDirection="column">
				<Text>Set {field.name}:</Text>
				<List
					items={[
						{ label: "true", value: "true" },
						{ label: "false", value: "false" },
					]}
					onSelect={(v) => save(v === "true")}
				/>
			</Box>
		);
	}
	if (isChoice) {
		if (!allowed) return <Loading label="values" />;
		if (allowed.length)
			return (
				<Box flexDirection="column">
					<Text>Set {field.name}:</Text>
					<List items={allowed.map((v) => ({ label: v, value: v }))} onSelect={(v) => save(v)} />
				</Box>
			);
		return (
			<Box>
				<Text>{field.name} = </Text>
				<TextEdit initial={fmt(field.value)} onSubmit={(v) => save(v)} />
			</Box>
		);
	}
	if (TEXT.has(field.type)) {
		return (
			<Box>
				<Text>{field.name} = </Text>
				<TextEdit
					initial={fmt(field.value)}
					onSubmit={(v) => save(field.type === "Number" && v.trim() !== "" ? Number(v) : v)}
				/>
			</Box>
		);
	}
	return <Text dimColor>Editing {field.type} fields isn't supported in the TUI yet.</Text>;
}

type Screen =
	| { t: "fc" }
	| { t: "notes"; fileClass: string }
	| { t: "fields"; note: string }
	| { t: "edit"; note: string; field: ExplainField };

function App({ vault }: { vault: string }) {
	const { exit } = useApp();
	const [stack, setStack] = useState<Screen[]>([{ t: "fc" }]);
	const [status, setStatus] = useState("");
	const push = (s: Screen): void => {
		setStatus("");
		setStack((st) => [...st, s]);
	};
	const pop = (): void => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
	const top = stack[stack.length - 1];

	useInput((_i, key) => {
		if (key.escape) {
			if (stack.length > 1) pop();
			else exit();
		}
	});

	const crumb = stack
		.map((s) =>
			s.t === "fc"
				? "fileClasses"
				: s.t === "notes"
					? s.fileClass
					: s.t === "fields"
						? (s.note.split("/").pop() ?? s.note)
						: s.field.name
		)
		.join(" › ");

	let body: ReactNode;
	switch (top.t) {
		case "fc":
			body = <FileClasses onPick={(fc) => push({ t: "notes", fileClass: fc })} />;
			break;
		case "notes":
			body = <Notes fileClass={top.fileClass} onPick={(note) => push({ t: "fields", note })} />;
			break;
		case "fields":
			body = <Fields note={top.note} onPick={(f) => push({ t: "edit", note: top.note, field: f })} />;
			break;
		case "edit":
			body = (
				<Edit
					note={top.note}
					field={top.field}
					onDone={(msg) => {
						setStatus(msg);
						pop();
					}}
				/>
			);
			break;
	}

	return (
		<Box flexDirection="column">
			<Text color="cyan">
				fileclass <Text dimColor>· vault:</Text> {vault}
			</Text>
			<Text dimColor>{crumb}   (↑↓ move · ↵ open/save · esc back · Ctrl+C quit)</Text>
			<Box marginY={1}>{body}</Box>
			{status ? <Text color={status.startsWith("✗") ? "red" : "yellow"}>{status}</Text> : null}
		</Box>
	);
}

export async function runTui(): Promise<void> {
	process.env.FILECLASS_QUIET = "1"; // keep the ink screen clean (no "vault:" lines)
	let vault: string;
	try {
		vault = (await callApi<{ name: string }>("vaultInfo")).name;
	} catch (e) {
		console.error((e as Error).message);
		process.exit(1);
	}
	render(<App vault={vault} />);
}
