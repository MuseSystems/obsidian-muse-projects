import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendOpenInterval, closeOpenInterval } from '../src/clockMutations';
import type { TimeEntry } from '../src/timeEntries';

const START = '2026-11-09T09:14:03-08:00';
const END = '2026-11-09T11:02:41-08:00';

function entry(end: string | null, id = '3f1c0a5e-7b14-4d2a-8c91-6e0b4a2d91f7'): TimeEntry {
	return {
		id,
		start: START,
		end,
		note: '',
		extra: {},
		keyOrder: ['id', 'start', 'end', 'note'],
	};
}

test('closing an open interval sets the end stamp', () => {
	const closed = closeOpenInterval([entry(null)], entry(null).id, END, 'ENG-00001');
	assert.equal(closed.ok, true);
	if (closed.ok) {
		assert.equal(closed.entries[0]?.end, END);
	}
});

test('closing refuses a missing row and a stamp that is not later', () => {
	const missing = closeOpenInterval([entry(END)], entry(null).id, END, 'ENG-00001');
	assert.equal(missing.ok, false);
	const early = closeOpenInterval([entry(null)], entry(null).id, START, 'ENG-00001');
	assert.equal(early.ok, false);
});

test('appending an open interval refuses a list that already has one', () => {
	const refused = appendOpenInterval([entry(null)], END, 'ENG-00001');
	assert.equal(refused.ok, false);
	const added = appendOpenInterval([entry(END)], END, 'ENG-00001');
	assert.equal(added.ok, true);
	if (added.ok) {
		assert.equal(added.entries.length, 2);
		assert.equal(added.entries[1]?.end, null);
		assert.equal(added.entries[1]?.start, END);
	}
});
