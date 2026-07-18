/*
 * Minimal CDP harness for e2e/canary tests (ARCHITECTURE.md §14).
 *
 * Connects to a dev Obsidian launched with `--remote-debugging-port=9222`
 * (opened on tests/e2e/fixture-vault/) and evaluates expressions in its main
 * renderer, the same pattern proven in ~/obsidian-bases-probe/cdp.js.
 *
 * Dependency-light on purpose: it speaks the DevTools Protocol over a raw
 * WebSocket (Node 22 has a global WebSocket) so the e2e harness needs no extra
 * npm package. Exposes `connect()` → { evaluate, close }.
 */

const DEBUG_PORT = process.env.OBSIDIAN_CDP_PORT || "9222";

async function listTargets() {
	const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
	if (!res.ok) throw new Error(`CDP /json/list HTTP ${res.status}`);
	return res.json();
}

/**
 * Opens a CDP session against the Obsidian renderer page.
 * @throws a helpful error when nothing is listening on the debug port.
 */
export async function connect() {
	let targets;
	try {
		targets = await listTargets();
	} catch (err) {
		throw new Error(
			`Cannot reach Obsidian DevTools on port ${DEBUG_PORT}.\n` +
				`Launch a dev Obsidian on the fixture vault with remote debugging, e.g.:\n` +
				`  open -na Obsidian --args --remote-debugging-port=${DEBUG_PORT}\n` +
				`(open the vault at tests/e2e/fixture-vault/ and enable the Fileclass plugin).\n` +
				`Underlying error: ${err.message}`
		);
	}

	const page = targets.find(
		(t) => t.type === "page" && String(t.url).startsWith("app://obsidian.md")
	);
	if (!page) throw new Error("No Obsidian renderer page found on the debug port.");

	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.addEventListener("open", resolve, { once: true });
		ws.addEventListener("error", () => reject(new Error("CDP WebSocket error")), {
			once: true,
		});
	});

	let nextId = 1;
	const pending = new Map();
	ws.addEventListener("message", (event) => {
		const msg = JSON.parse(event.data);
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
			pending.delete(msg.id);
			if (msg.error) reject(new Error(msg.error.message));
			else resolve(msg.result);
		}
	});

	const send = (method, params) =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			pending.set(id, { resolve, reject });
			ws.send(JSON.stringify({ id, method, params }));
		});

	await send("Runtime.enable", {});

	/**
	 * Evaluates `fn` (a function) inside Obsidian with the given JSON-serializable
	 * args, awaiting any returned promise, and returns its value by value.
	 */
	const evaluate = async (fn, ...args) => {
		const expression = `(${fn.toString()})(${args
			.map((a) => JSON.stringify(a))
			.join(",")})`;
		const result = await send("Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: true,
		});
		if (result.exceptionDetails) {
			const d = result.exceptionDetails;
			throw new Error(
				`Obsidian evaluation error: ${
					(d.exception && d.exception.description) || d.text
				}`
			);
		}
		return result.result.value;
	};

	return { evaluate, close: () => ws.close() };
}
