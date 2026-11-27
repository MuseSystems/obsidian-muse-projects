import { MSPRJ_TSK_TIME_ENTRIES } from './constants';
import { parseStamp } from './stamps';
import { canonicalObjectId, newObjectId } from './uuid';

export interface TimeEntry {
	id: string;
	start: string;
	/** Null while the interval is open. */
	end: string | null;
	note: string;
	extra: Record<string, unknown>;
	keyOrder: string[];
}

export type TimeEntryRead =
	| { ok: true; entries: TimeEntry[] }
	| { ok: false; reason: string };

const KNOWN_KEYS = new Set(['id', 'start', 'end', 'note']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson(value: unknown): unknown {
	if (value === undefined) {
		return null;
	}
	return JSON.parse(JSON.stringify(value)) as unknown;
}

function allocateId(used: Set<string>): string | null {
	for (let attempt = 0; attempt < 8; attempt++) {
		const id = newObjectId();
		if (!used.has(id)) {
			return id;
		}
	}
	return null;
}

/**
 * Read a frontmatter list. A missing value or null is an empty list.
 * Every element must be an object with a parseable start and an end that is
 * null or parseable. The end key must be present so an omitted end is not
 * treated as open.
 */
export function readTimeEntries(raw: unknown): TimeEntryRead {
	if (raw === undefined || raw === null) {
		return { ok: true, entries: [] };
	}
	if (!Array.isArray(raw)) {
		return { ok: false, reason: `${MSPRJ_TSK_TIME_ENTRIES} is not a list.` };
	}

	const entries: TimeEntry[] = [];
	for (let index = 0; index < raw.length; index++) {
		const row = raw[index];
		const label = `Interval ${index + 1}`;
		if (!isPlainObject(row)) {
			return { ok: false, reason: `${label} is not an object.` };
		}
		const keyOrder = Object.keys(row);
		if (!Object.prototype.hasOwnProperty.call(row, 'start')) {
			return { ok: false, reason: `${label} has no start.` };
		}
		if (!Object.prototype.hasOwnProperty.call(row, 'end')) {
			return { ok: false, reason: `${label} has no end.` };
		}
		if (typeof row.start !== 'string' || !parseStamp(row.start)) {
			return { ok: false, reason: `${label} start is not a stamp.` };
		}
		let end: string | null;
		if (row.end === null) {
			end = null;
		} else if (typeof row.end === 'string' && parseStamp(row.end)) {
			end = row.end;
		} else {
			return { ok: false, reason: `${label} end is not a stamp or empty.` };
		}

		let note = '';
		if (Object.prototype.hasOwnProperty.call(row, 'note') && row.note != null) {
			if (typeof row.note !== 'string') {
				return { ok: false, reason: `${label} note is not text.` };
			}
			note = row.note;
		}

		let id = '';
		if (Object.prototype.hasOwnProperty.call(row, 'id') && row.id != null && row.id !== '') {
			if (typeof row.id !== 'string') {
				return { ok: false, reason: `${label} id is not text.` };
			}
			id = row.id;
		}

		const extra: Record<string, unknown> = {};
		for (const key of keyOrder) {
			if (KNOWN_KEYS.has(key)) {
				continue;
			}
			extra[key] = cloneJson(row[key]);
		}
		entries.push({
			id,
			start: row.start,
			end,
			note,
			extra,
			keyOrder: [...keyOrder],
		});
	}

	return { ok: true, entries };
}

/**
 * Fill ids, rewrite stamps to canonical form, and reject a list that would
 * store an end that is not after its start or a second open interval.
 * An id that is missing, duplicated, or not a UUID version 4 is replaced.
 * A UUID version 4 is stored in lowercase. Overlaps between intervals are kept.
 */
export function prepareForWrite(entries: TimeEntry[]): TimeEntryRead {
	const used = new Set<string>();
	let openCount = 0;
	const prepared: TimeEntry[] = [];

	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		if (!entry) {
			return { ok: false, reason: `Interval ${index + 1} is missing.` };
		}
		const label = `Interval ${index + 1}`;
		let id = canonicalObjectId(entry.id);
		if (!id || used.has(id)) {
			const allocated = allocateId(used);
			if (!allocated) {
				return { ok: false, reason: 'Could not allocate a time entry id.' };
			}
			id = allocated;
		}
		used.add(id);

		const start = parseStamp(entry.start);
		if (!start) {
			return { ok: false, reason: `${label} start is not a stamp.` };
		}

		let end: string | null = null;
		if (entry.end !== null) {
			const parsedEnd = parseStamp(entry.end);
			if (!parsedEnd) {
				return { ok: false, reason: `${label} end is not a stamp.` };
			}
			if (Math.floor(start.instant / 1000) >= Math.floor(parsedEnd.instant / 1000)) {
				return { ok: false, reason: `${label} end must be after start.` };
			}
			end = parsedEnd.canonical;
		} else {
			openCount += 1;
			if (openCount > 1) {
				return { ok: false, reason: 'Only one open interval is allowed on a task.' };
			}
		}

		prepared.push({
			id,
			start: start.canonical,
			end,
			note: entry.note,
			extra: entry.extra,
			keyOrder: entry.keyOrder.length > 0 ? [...entry.keyOrder] : ['id', 'start', 'end', 'note'],
		});
	}

	return { ok: true, entries: prepared };
}

export function openEntry(stamp: string): TimeEntry {
	return {
		id: '',
		start: stamp,
		end: null,
		note: '',
		extra: {},
		keyOrder: ['id', 'start', 'end', 'note'],
	};
}

/** Plain objects for processFrontMatter. Open end is null, which Obsidian writes as an empty value. */
export function entriesToYaml(entries: TimeEntry[]): Record<string, unknown>[] {
	return entries.map((entry) => {
		const known: Record<string, unknown> = {
			id: entry.id,
			start: entry.start,
			end: entry.end,
			note: entry.note,
		};
		const out: Record<string, unknown> = {};
		const seen = new Set<string>();
		for (const key of entry.keyOrder) {
			if (Object.prototype.hasOwnProperty.call(known, key)) {
				out[key] = known[key];
			} else if (Object.prototype.hasOwnProperty.call(entry.extra, key)) {
				out[key] = entry.extra[key];
			}
			seen.add(key);
		}
		for (const key of ['id', 'start', 'end', 'note']) {
			if (!seen.has(key)) {
				out[key] = known[key];
			}
		}
		for (const [key, value] of Object.entries(entry.extra)) {
			if (!seen.has(key)) {
				out[key] = value;
			}
		}
		return out;
	});
}

/** True when both reads would write the same list, including extra keys and key order. */
export function timeEntriesEqual(left: TimeEntry[], right: TimeEntry[]): boolean {
	return JSON.stringify(entriesToYaml(left)) === JSON.stringify(entriesToYaml(right));
}
