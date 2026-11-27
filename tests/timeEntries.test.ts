import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	entriesToYaml,
	openEntry,
	prepareForWrite,
	readTimeEntries,
	timeEntriesEqual,
	type TimeEntry,
} from '../src/timeEntries';

const START = '2026-11-09T09:14:03-08:00';
const END = '2026-11-09T11:02:41-08:00';

function entry(partial: Pick<TimeEntry, 'start' | 'end'> & Partial<TimeEntry>): TimeEntry {
	return {
		id: partial.id ?? 'aaaaaaaa',
		start: partial.start,
		end: partial.end,
		note: partial.note ?? '',
		extra: partial.extra ?? {},
		keyOrder: partial.keyOrder ?? ['id', 'start', 'end', 'note'],
	};
}

test('a missing list is empty, and a non-list is refused', () => {
	assert.deepEqual(readTimeEntries(undefined), { ok: true, entries: [] });
	assert.deepEqual(readTimeEntries(null), { ok: true, entries: [] });
	const refused = readTimeEntries('nope');
	assert.equal(refused.ok, false);
});

test('an omitted end is not an open interval', () => {
	const read = readTimeEntries([{ id: 'aaaaaaaa', start: START, note: '' }]);
	assert.equal(read.ok, false);
	if (!read.ok) {
		assert.match(read.reason, /has no end/);
	}
});

test('null end is open, and a bad end or note is refused', () => {
	const open = readTimeEntries([{ id: 'aaaaaaaa', start: START, end: null, note: '' }]);
	assert.equal(open.ok, true);
	if (open.ok) {
		assert.equal(open.entries[0]?.end, null);
	}
	assert.equal(readTimeEntries([{ start: START, end: 'yesterday' }]).ok, false);
	assert.equal(readTimeEntries([{ start: START, end: END, note: 1 }]).ok, false);
	assert.equal(readTimeEntries([{ id: 1, start: START, end: END }]).ok, false);
	assert.equal(readTimeEntries([null]).ok, false);
});

test('unknown keys and list order survive a read and a yaml write', () => {
	const raw = [
		{
			note: 'kept',
			start: START,
			end: END,
			id: 'aaaaaaaa',
			billable: false,
		},
	];
	const read = readTimeEntries(raw);
	assert.equal(read.ok, true);
	if (!read.ok) {
		return;
	}
	assert.deepEqual(read.entries[0]?.keyOrder, ['note', 'start', 'end', 'id', 'billable']);
	assert.deepEqual(read.entries[0]?.extra, { billable: false });
	assert.deepEqual(entriesToYaml(read.entries), raw);
});

test('prepare rewrites stamps, fills ids, and rejects a second open interval', () => {
	const prepared = prepareForWrite([
		entry({ id: '', start: '2026-11-09T09:14:03Z', end: '2026-11-09T11:02:41Z' }),
	]);
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	assert.match(prepared.entries[0]?.id ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	assert.equal(prepared.entries[0]?.start, '2026-11-09T09:14:03+00:00');
	assert.equal(prepared.entries[0]?.end, '2026-11-09T11:02:41+00:00');

	const twoOpen = prepareForWrite([
		openEntry(START),
		entry({ id: 'bbbbbbbb', start: END, end: null }),
	]);
	assert.equal(twoOpen.ok, false);
});

test('end must be after start at whole-second resolution; overlaps are kept', () => {
	const sameSecond = prepareForWrite([
		entry({
			start: '2026-11-09T09:14:03.100-08:00',
			end: '2026-11-09T09:14:03.900-08:00',
		}),
	]);
	assert.equal(sameSecond.ok, false);

	const nextSecond = prepareForWrite([
		entry({
			start: '2026-11-09T09:14:03.900-08:00',
			end: '2026-11-09T09:14:04.100-08:00',
		}),
	]);
	assert.equal(nextSecond.ok, true);
	if (nextSecond.ok) {
		assert.equal(nextSecond.entries[0]?.start, START);
		assert.equal(nextSecond.entries[0]?.end, '2026-11-09T09:14:04-08:00');
	}

	const overlap = prepareForWrite([
		entry({ start: START, end: END }),
		entry({ id: 'bbbbbbbb', start: '2026-11-09T10:00:00-08:00', end: '2026-11-09T12:00:00-08:00' }),
	]);
	assert.equal(overlap.ok, true);
});

const KEPT = '3f1c0a5e-7b14-4d2a-8c91-6e0b4a2d91f7';

test('a duplicate id is replaced on the later row, and a non-UUID is replaced', () => {
	const prepared = prepareForWrite([
		entry({ id: KEPT, start: START, end: END }),
		entry({ id: KEPT.toUpperCase(), start: '2026-11-09T12:00:00-08:00', end: '2026-11-09T13:00:00-08:00' }),
		entry({ id: 'aaaaaaaa', start: '2026-11-09T14:00:00-08:00', end: '2026-11-09T15:00:00-08:00' }),
	]);
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	assert.equal(prepared.entries[0]?.id, KEPT);
	assert.match(prepared.entries[1]?.id ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	assert.notEqual(prepared.entries[1]?.id, KEPT);
	assert.match(prepared.entries[2]?.id ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	assert.notEqual(prepared.entries[2]?.id, prepared.entries[1]?.id);
});

test('equality sees an end that changed, which is the stale-save case', () => {
	const opened = readTimeEntries([{ id: 'aaaaaaaa', start: START, end: null, note: '' }]);
	const closed = readTimeEntries([{ id: 'aaaaaaaa', start: START, end: END, note: '' }]);
	assert.equal(opened.ok && closed.ok, true);
	if (!opened.ok || !closed.ok) {
		return;
	}
	assert.equal(timeEntriesEqual(opened.entries, opened.entries), true);
	assert.equal(timeEntriesEqual(opened.entries, closed.entries), false);
});
