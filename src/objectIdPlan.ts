/** One managed note considered for `msprj_id` repair. */
export interface ObjectIdRow {
	path: string;
	/** Canonical UUID, or null when the stored value is missing or not a UUID version 4. */
	id: string | null;
	/** The stored text is already the canonical form. */
	canonical: boolean;
}

export interface ObjectIdPlan {
	/** Unique ids whose stored text is not canonical yet. */
	canonicalize: { path: string; id: string }[];
	/** Notes with no UUID version 4. Sorted by path. */
	assign: string[];
	/**
	 * The same canonical id on more than one note.
	 * Left unchanged so two devices do not mint different replacements.
	 */
	duplicates: { id: string; paths: string[] }[];
}

/**
 * Decide id repairs from the notes in hand.
 * A duplicate is reported, not rewritten. Path order is the same on every device that has the same files.
 */
export function planObjectIds(rows: readonly ObjectIdRow[]): ObjectIdPlan {
	const canonicalize: { path: string; id: string }[] = [];
	const assign: string[] = [];
	const byId = new Map<string, { path: string; canonical: boolean }[]>();

	for (const row of rows) {
		if (!row.id) {
			assign.push(row.path);
			continue;
		}
		const group = byId.get(row.id);
		if (group) {
			group.push({ path: row.path, canonical: row.canonical });
		} else {
			byId.set(row.id, [{ path: row.path, canonical: row.canonical }]);
		}
	}

	const duplicates: { id: string; paths: string[] }[] = [];
	for (const [id, group] of byId) {
		const paths = group.map((item) => item.path).sort((a, b) => a.localeCompare(b));
		if (paths.length > 1) {
			duplicates.push({ id, paths });
			continue;
		}
		const only = group[0];
		if (only && !only.canonical) {
			canonicalize.push({ path: only.path, id });
		}
	}

	assign.sort((a, b) => a.localeCompare(b));
	canonicalize.sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
	duplicates.sort((a, b) => a.id.localeCompare(b.id) || a.paths[0]!.localeCompare(b.paths[0]!));
	return { canonicalize, assign, duplicates };
}
