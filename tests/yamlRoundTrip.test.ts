import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse, stringify } from 'yaml';

/**
 * Obsidian 1.15.0 writes frontmatter with these yaml 2.9.1 options.
 * nullStr "" makes an open `end: null` store as `end:`.
 */
const writerOptions = {
	nullStr: '',
	lineWidth: 0,
	aliasDuplicateObjects: false,
};

function write(value: unknown): string {
	return stringify(value, writerOptions);
}

test('offset stamps stay unquoted strings and null end round-trips', () => {
	const value = {
		msprj_tsk_time_entries: [
			{
				id: 'a1b2c3d4',
				start: '2026-11-09T09:14:03-08:00',
				end: '2026-11-09T11:02:41-08:00',
				note: '',
			},
			{
				id: 'e5f6a7b8',
				start: '2026-11-09T13:00:00Z',
				end: null,
				note: '',
			},
		],
	};
	const text = write(value);
	assert.match(text, /^ *start: 2026-11-09T09:14:03-08:00$/m);
	assert.match(text, /^ *start: 2026-11-09T13:00:00Z$/m);
	assert.match(text, /^ *end:$/m);
	assert.match(text, /^ *note: ""$/m);

	const parsed = parse(text) as typeof value;
	const closed = parsed.msprj_tsk_time_entries[0];
	const open = parsed.msprj_tsk_time_entries[1];
	if (!closed || !open) {
		assert.fail('expected two intervals');
	}
	assert.equal(typeof closed.start, 'string');
	assert.equal(closed.start, '2026-11-09T09:14:03-08:00');
	assert.equal(typeof closed.end, 'string');
	assert.equal(open.end, null);
	assert.equal(open.note, '');
	assert.equal(typeof open.start, 'string');
});

test('Z, basic offset, fractional seconds, and +00:00 parse as strings', () => {
	const text = write({
		z: '2026-11-09T09:14:03Z',
		basic: '2026-11-09T09:14:03-0800',
		fraction: '2026-11-09T09:14:03.5-08:00',
		utc: '2026-11-09T09:14:03+00:00',
	});
	const parsed = parse(text) as Record<string, unknown>;
	for (const key of ['z', 'basic', 'fraction', 'utc']) {
		assert.equal(typeof parsed[key], 'string', key);
	}
	assert.equal(parsed.z, '2026-11-09T09:14:03Z');
	assert.equal(parsed.basic, '2026-11-09T09:14:03-0800');
	assert.equal(parsed.fraction, '2026-11-09T09:14:03.5-08:00');
	assert.equal(parsed.utc, '2026-11-09T09:14:03+00:00');
});
