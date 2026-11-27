import { parseStamp } from './stamps';
import { openEntry, type TimeEntry, type TimeEntryRead } from './timeEntries';

/** Close the open interval with this id. The file is left unchanged when the row is gone or the stamp is not later. */
export function closeOpenInterval(
	entries: TimeEntry[],
	id: string,
	stamp: string,
	code: string,
): TimeEntryRead {
	const index = entries.findIndex((entry) => entry.id === id && entry.end === null);
	const row = index >= 0 ? entries[index] : undefined;
	if (!row) {
		return { ok: false, reason: 'Open interval changed. Nothing written.' };
	}
	if (!stampIsAfter(row.start, stamp)) {
		return { ok: false, reason: notBeforeMessage(code, row.start, stamp) };
	}
	const next = entries.slice();
	next[index] = { ...row, end: stamp };
	return { ok: true, entries: next };
}

/** Append one open interval. Refuses when the list already has one. */
export function appendOpenInterval(entries: TimeEntry[], stamp: string, code: string): TimeEntryRead {
	if (entries.some((entry) => entry.end === null)) {
		return { ok: false, reason: `${code} already has an open interval. Nothing written.` };
	}
	return { ok: true, entries: [...entries, openEntry(stamp)] };
}

export function notBeforeMessage(code: string, start: string, stamp: string): string {
	return `Open clock on ${code} starts at ${start}, which is not before ${stamp}. Nothing written.`;
}

function stampIsAfter(start: string, stamp: string): boolean {
	const opened = parseStamp(start);
	const closed = parseStamp(stamp);
	return Boolean(opened && closed && opened.instant < closed.instant);
}
