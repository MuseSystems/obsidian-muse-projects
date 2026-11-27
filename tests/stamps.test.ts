import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	composeStamp,
	formatElapsed,
	formatOffset,
	parseStamp,
	stampNow,
} from '../src/stamps';

const OFFSET = '2026-11-09T09:14:03-08:00';
const UTC_INSTANT = Date.UTC(2026, 10, 9, 17, 14, 3);

test('canonical form is second resolution with a numeric offset', () => {
	const parsed = parseStamp(OFFSET);
	assert.ok(parsed);
	assert.equal(parsed.canonical, OFFSET);
	assert.equal(parsed.date, '2026-11-09');
	assert.equal(parsed.time, '09:14:03');
	assert.equal(parsed.offset, '-08:00');
	assert.equal(parsed.instant, UTC_INSTANT);
});

test('Z, z, ±HH, ±HHMM, and ±HH:mm resolve to the same instant', () => {
	const forms = [
		'2026-11-09T17:14:03Z',
		'2026-11-09T17:14:03z',
		'2026-11-09T17:14:03+00',
		'2026-11-09T17:14:03+0000',
		'2026-11-09T17:14:03+00:00',
		'2026-11-09T09:14:03-0800',
		OFFSET,
	];
	for (const form of forms) {
		const parsed = parseStamp(form);
		assert.ok(parsed, form);
		assert.equal(parsed.instant, UTC_INSTANT, form);
		assert.equal(parsed.canonical.includes('.'), false, form);
	}
	assert.equal(parseStamp('2026-11-09T17:14:03Z')?.canonical, '2026-11-09T17:14:03+00:00');
	assert.equal(parseStamp('2026-11-09T09:14:03-08')?.canonical, OFFSET);
});

test('a space separator resolves and the canonical form uses T', () => {
	const parsed = parseStamp('2026-11-09 09:14:03-08:00');
	assert.ok(parsed);
	assert.equal(parsed.canonical, OFFSET);
});

test('fractional seconds stay in the instant and drop from the canonical write form', () => {
	const parsed = parseStamp('2026-11-09T09:14:03.5-08:00');
	assert.ok(parsed);
	assert.equal(parsed.instant, UTC_INSTANT + 500);
	assert.equal(parsed.canonical, OFFSET);
	const truncated = parseStamp('2026-11-09T09:14:03.123456789-08:00');
	assert.ok(truncated);
	assert.equal(truncated.instant, UTC_INSTANT + 123);
	assert.equal(truncated.canonical, OFFSET);
});

test('a zone-less string, an impossible date, and a non-string do not resolve', () => {
	assert.equal(parseStamp('2026-11-09T09:14:03'), null);
	assert.equal(parseStamp('2026-02-31T00:00:00Z'), null);
	assert.equal(parseStamp('2026-11-09T24:00:00Z'), null);
	assert.equal(parseStamp('2026-11-09T09:14:60Z'), null);
	assert.equal(parseStamp(1), null);
	assert.equal(parseStamp(null), null);
});

test('composeStamp trims the edit-modal fields', () => {
	const parsed = composeStamp(' 2026-11-09 ', ' 09:14:03 ', ' -08:00 ');
	assert.ok(parsed);
	assert.equal(parsed.canonical, OFFSET);
	assert.equal(composeStamp('2026-11-09', '09:14', '-08:00'), null);
});

test('stampNow floors to the local whole second and uses the OS offset', () => {
	const now = new Date(2026, 10, 12, 4, 39, 7, 900);
	const floored = new Date(Math.floor(now.getTime() / 1000) * 1000);
	const stamp = stampNow(now);
	const parsed = parseStamp(stamp);
	assert.ok(parsed);
	assert.equal(parsed.canonical, stamp);
	assert.equal(parsed.date, '2026-11-12');
	assert.equal(parsed.time, '04:39:07');
	assert.equal(parsed.offset, formatOffset(-floored.getTimezoneOffset()));
	assert.equal(parsed.instant % 1000, 0);
});

test('formatElapsed is unwrapped h:mm:ss and clamps negatives to zero', () => {
	assert.equal(formatElapsed(-1), '0:00:00');
	assert.equal(formatElapsed(0), '0:00:00');
	assert.equal(formatElapsed(90_000), '0:01:30');
	assert.equal(formatElapsed(3_661_000), '1:01:01');
});

test('a zero offset is +00:00', () => {
	assert.equal(formatOffset(0), '+00:00');
	assert.equal(formatOffset(-90), '-01:30');
});
