/* Parses a `--where "<field> <op> [value]"` expression into an API filter. */

export type FilterOp = "is" | "isNot" | "contains" | "isEmpty" | "isNotEmpty";
export interface Filter {
	field: string;
	op: FilterOp;
	value?: unknown;
}

const OPS: ReadonlySet<string> = new Set(["is", "isNot", "contains", "isEmpty", "isNotEmpty"]);

export function parseWhere(expr?: string): Filter | undefined {
	if (!expr) return undefined;
	const [field, op, ...rest] = expr.trim().split(/\s+/);
	if (!field || !OPS.has(op)) {
		throw new Error(
			`Invalid --where "${expr}". Use: <field> <is|isNot|contains|isEmpty|isNotEmpty> [value]`
		);
	}
	const value = rest.length ? rest.join(" ") : undefined;
	return { field, op: op as FilterOp, value };
}
