import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	formatReportedClock,
	organizationReportClockFormat,
	parseClockFormat,
} from '../src/clockFormat';

test('parse accepts only 24-hour and 12-hour', () => {
	assert.equal(parseClockFormat('24-hour'), '24-hour');
	assert.equal(parseClockFormat(' 12-Hour '), '12-hour');
	assert.equal(parseClockFormat('24-HOUR'), '24-hour');
	assert.equal(parseClockFormat(''), null);
	assert.equal(parseClockFormat('12'), null);
	assert.equal(parseClockFormat('h12'), null);
	assert.equal(parseClockFormat(12), null);
	assert.equal(parseClockFormat(null), null);
});

test('an organization report keeps its stored clock format when the standard differs', () => {
	assert.equal(organizationReportClockFormat('12-hour', '24-hour'), '12-hour');
	assert.equal(organizationReportClockFormat('24-hour', '12-hour'), '24-hour');
	assert.equal(organizationReportClockFormat(null, '12-hour'), '12-hour');
	assert.equal(organizationReportClockFormat(null, '24-hour'), '24-hour');
});

test('24-hour prints the civil time with seconds', () => {
	assert.equal(formatReportedClock('00:00:00', '24-hour'), '00:00:00');
	assert.equal(formatReportedClock('14:30:05', '24-hour'), '14:30:05');
	assert.equal(formatReportedClock('23:16:27', '24-hour'), '23:16:27');
});

test('12-hour uses AM and PM, with midnight and noon at 12', () => {
	assert.equal(formatReportedClock('00:00:00', '12-hour'), '12:00:00 AM');
	assert.equal(formatReportedClock('00:05:09', '12-hour'), '12:05:09 AM');
	assert.equal(formatReportedClock('01:01:00', '12-hour'), '1:01:00 AM');
	assert.equal(formatReportedClock('11:59:59', '12-hour'), '11:59:59 AM');
	assert.equal(formatReportedClock('12:00:00', '12-hour'), '12:00:00 PM');
	assert.equal(formatReportedClock('14:30:05', '12-hour'), '2:30:05 PM');
	assert.equal(formatReportedClock('23:16:27', '12-hour'), '11:16:27 PM');
});

test('formatReportedClock rejects a time that is not HH:mm:ss', () => {
	assert.equal(formatReportedClock('24:00:00', '24-hour'), null);
	assert.equal(formatReportedClock('14:30', '12-hour'), null);
	assert.equal(formatReportedClock('2:30:05 PM', '12-hour'), null);
	assert.equal(formatReportedClock('', '24-hour'), null);
});
