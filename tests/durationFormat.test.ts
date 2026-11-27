import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	formatReportedDuration,
	organizationReportDurationFormat,
	parseDurationFormat,
} from '../src/durationFormat';

test('parse accepts only hours-minutes and decimal-hours', () => {
	assert.equal(parseDurationFormat('hours-minutes'), 'hours-minutes');
	assert.equal(parseDurationFormat(' Decimal-Hours '), 'decimal-hours');
	assert.equal(parseDurationFormat('HOURS-MINUTES'), 'hours-minutes');
	assert.equal(parseDurationFormat(''), null);
	assert.equal(parseDurationFormat('decimal'), null);
	assert.equal(parseDurationFormat('1:30'), null);
	assert.equal(parseDurationFormat(1), null);
	assert.equal(parseDurationFormat(null), null);
});

test('an organization report keeps its stored format when the standard differs', () => {
	assert.equal(organizationReportDurationFormat('decimal-hours', 'hours-minutes'), 'decimal-hours');
	assert.equal(organizationReportDurationFormat('hours-minutes', 'decimal-hours'), 'hours-minutes');
	assert.equal(organizationReportDurationFormat(null, 'decimal-hours'), 'decimal-hours');
	assert.equal(organizationReportDurationFormat(null, 'hours-minutes'), 'hours-minutes');
});

test('hours and minutes round to the nearest minute and do not wrap at 24', () => {
	assert.equal(formatReportedDuration(0, 'hours-minutes'), '0:00');
	assert.equal(formatReportedDuration(0.4, 'hours-minutes'), '0:00');
	assert.equal(formatReportedDuration(0.5, 'hours-minutes'), '0:01');
	assert.equal(formatReportedDuration(45, 'hours-minutes'), '0:45');
	assert.equal(formatReportedDuration(90, 'hours-minutes'), '1:30');
	assert.equal(formatReportedDuration(90.4, 'hours-minutes'), '1:30');
	assert.equal(formatReportedDuration(90.5, 'hours-minutes'), '1:31');
	assert.equal(formatReportedDuration(61, 'hours-minutes'), '1:01');
	assert.equal(formatReportedDuration(1500, 'hours-minutes'), '25:00');
});

test('decimal hours round to the nearest hundredth of an hour', () => {
	assert.equal(formatReportedDuration(0, 'decimal-hours'), '0.00');
	assert.equal(formatReportedDuration(0.5, 'decimal-hours'), '0.01');
	assert.equal(formatReportedDuration(1, 'decimal-hours'), '0.02');
	assert.equal(formatReportedDuration(45, 'decimal-hours'), '0.75');
	assert.equal(formatReportedDuration(90, 'decimal-hours'), '1.50');
	assert.equal(formatReportedDuration(1500, 'decimal-hours'), '25.00');
});

test('formatReportedDuration rejects a duration that is not a non-negative finite number', () => {
	assert.equal(formatReportedDuration(-1, 'hours-minutes'), null);
	assert.equal(formatReportedDuration(Number.NaN, 'decimal-hours'), null);
	assert.equal(formatReportedDuration(Number.POSITIVE_INFINITY, 'hours-minutes'), null);
});
