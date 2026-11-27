import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	organizationReportWeekStart,
	parseWeekStart,
	previousWeek,
	weekContaining,
	weekStartDay,
} from '../src/weekStart';

test('parse accepts monday, sunday, and saturday', () => {
	assert.equal(parseWeekStart('monday'), 'monday');
	assert.equal(parseWeekStart(' Sunday '), 'sunday');
	assert.equal(parseWeekStart('MONDAY'), 'monday');
	assert.equal(parseWeekStart('Saturday'), 'saturday');
	assert.equal(parseWeekStart(''), null);
	assert.equal(parseWeekStart('friday'), null);
	assert.equal(parseWeekStart(1), null);
	assert.equal(parseWeekStart(null), null);
});

test('week start days match Date#getDay', () => {
	assert.equal(weekStartDay('sunday'), 0);
	assert.equal(weekStartDay('monday'), 1);
	assert.equal(weekStartDay('saturday'), 6);
});

test('an organization report keeps its stored week when the standard differs', () => {
	assert.equal(organizationReportWeekStart('sunday', 'monday'), 'sunday');
	assert.equal(organizationReportWeekStart('monday', 'sunday'), 'monday');
	assert.equal(organizationReportWeekStart('saturday', 'monday'), 'saturday');
	assert.equal(organizationReportWeekStart(null, 'sunday'), 'sunday');
	assert.equal(organizationReportWeekStart(null, 'monday'), 'monday');
	assert.equal(organizationReportWeekStart(null, 'saturday'), 'saturday');
});

test('Monday–Sunday and Sunday–Saturday weeks meet on Sunday', () => {
	assert.deepEqual(weekContaining('2026-11-15', 'monday'), {
		start: '2026-11-09',
		end: '2026-11-15',
	});
	assert.deepEqual(weekContaining('2026-11-15', 'sunday'), {
		start: '2026-11-15',
		end: '2026-11-21',
	});
	assert.deepEqual(weekContaining('2026-11-16', 'monday'), {
		start: '2026-11-16',
		end: '2026-11-22',
	});
	assert.deepEqual(weekContaining('2026-11-16', 'sunday'), {
		start: '2026-11-15',
		end: '2026-11-21',
	});
});

test('Saturday–Friday contains Friday in the week that started the previous Saturday', () => {
	assert.deepEqual(weekContaining('2026-11-13', 'saturday'), {
		start: '2026-11-07',
		end: '2026-11-13',
	});
	assert.deepEqual(weekContaining('2026-11-15', 'saturday'), {
		start: '2026-11-14',
		end: '2026-11-20',
	});
	assert.deepEqual(weekContaining('2026-01-01', 'saturday'), {
		start: '2025-12-27',
		end: '2026-01-02',
	});
});

test('the previous complete week sits immediately before the week that contains today', () => {
	assert.deepEqual(previousWeek('2026-11-15', 'monday'), {
		start: '2026-11-02',
		end: '2026-11-08',
	});
	assert.deepEqual(previousWeek('2026-11-15', 'sunday'), {
		start: '2026-11-08',
		end: '2026-11-14',
	});
	assert.deepEqual(previousWeek('2026-11-15', 'saturday'), {
		start: '2026-11-07',
		end: '2026-11-13',
	});
	assert.deepEqual(previousWeek('2026-01-01', 'monday'), {
		start: '2025-12-22',
		end: '2025-12-28',
	});
	assert.equal(previousWeek('2026-02-31', 'saturday'), null);
});

test('a week can cross a year boundary', () => {
	assert.deepEqual(weekContaining('2026-01-01', 'monday'), {
		start: '2025-12-29',
		end: '2026-01-04',
	});
	assert.deepEqual(weekContaining('2026-01-01', 'sunday'), {
		start: '2025-12-28',
		end: '2026-01-03',
	});
});

test('weekContaining rejects dates that are not real calendar days', () => {
	assert.equal(weekContaining('2026-02-31', 'monday'), null);
	assert.equal(weekContaining('2026-11-15T00:00:00', 'sunday'), null);
	assert.equal(weekContaining('', 'monday'), null);
});
