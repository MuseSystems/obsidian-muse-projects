import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shiftISODate } from '../src/dates';
import {
	buildReport,
	intervalsForOrganization,
	parseReportSource,
	projectNoteDescription,
	projectReportLabel,
	type ReportFormats,
	type ReportInterval,
	type ReportTaskInput,
} from '../src/timeReport';

const decimalMonday: ReportFormats = {
	weekStart: 'monday',
	durationFormat: 'decimal-hours',
	clockFormat: '24-hour',
};

test('active projects list active notes and omit general admin, name linked, sorted by code', () => {
	const report = buildReport('active-projects', [], decimalMonday, '2026-11-15', [
		{
			code: 'BBB',
			name: 'Bravo',
			path: 'Projects/b.md',
			status: 'active',
			generalAdmin: false,
			due: '',
			description: '',
		},
		{
			code: 'AAA',
			name: 'Alpha',
			path: 'Projects/a.md',
			status: ' Active ',
			generalAdmin: false,
			due: '2026-12-01',
			description: 'One line.',
		},
		{
			code: 'ADM',
			name: 'Admin',
			path: 'Projects/admin.md',
			status: 'active',
			generalAdmin: true,
			due: '',
			description: 'Overhead.',
		},
		{
			code: 'CCC',
			name: 'Done work',
			path: 'Projects/c.md',
			status: 'complete',
			generalAdmin: false,
			due: '2026-01-01',
			description: 'Finished.',
		},
		{
			code: 'DDD',
			name: 'Unset',
			path: 'Projects/d.md',
			status: '',
			generalAdmin: false,
			due: '',
			description: '',
		},
	]);
	assert.equal(report.title, 'Active Projects');
	assert.equal(report.empty, null);
	assert.deepEqual(report.groups[0]?.table.headers, [
		'Code',
		'Name',
		'Target Date',
		'Status',
		'Description',
	]);
	assert.deepEqual(report.groups[0]?.table.rows.map((row) => row.cells), [
		['AAA', 'Alpha', '2026-12-01', 'Active', 'One line.'],
		['BBB', 'Bravo', '', 'active', ''],
	]);
	assert.equal(report.groups[0]?.table.rows[0]?.linkIndex, 1);
	assert.equal(report.groups[0]?.table.rows[0]?.linkPath, 'Projects/a.md');
});

test('an organization with no active projects keeps the heading', () => {
	const report = buildReport('active-projects', [], decimalMonday, '2026-11-15', []);
	assert.equal(report.title, 'Active Projects');
	assert.equal(report.empty, 'No active projects.');
	assert.deepEqual(report.groups, []);
});

test('a project description is the first body paragraph', () => {
	const note = `---
msprj_prj_name: Billable Project
---

# Billable Project

This is the one-liner description of the project which might be good in an "active projects list".

[[bprj001-00001-a-test-task]]
`;
	assert.equal(
		projectNoteDescription(note),
		'This is the one-liner description of the project which might be good in an "active projects list".',
	);
	assert.equal(projectNoteDescription('---\ntitle: x\n---\n\n# Title\n\n[[only a link]]\n'), '');
	assert.equal(
		projectNoteDescription('# Title\n\nFirst line\nkeeps going.\n\nSecond paragraph.'),
		'First line keeps going.',
	);
});

test('a project label is code, name, and a hyphen when both are present', () => {
	assert.equal(projectReportLabel('BPRJ001', 'Billable Project'), 'BPRJ001 - Billable Project');
	assert.equal(projectReportLabel(' BPRJ001 ', ' Billable Project '), 'BPRJ001 - Billable Project');
	assert.equal(projectReportLabel('BPRJ001', ''), 'BPRJ001');
	assert.equal(projectReportLabel('', 'Billable Project'), 'Billable Project');
	assert.equal(projectReportLabel('BPRJ001', 'BPRJ001'), 'BPRJ001');
	assert.equal(projectReportLabel('  ', ' '), '');
});

test('a block body is one section, with an optional org line', () => {
	assert.deepEqual(parseReportSource('last-period\n'), {
		ok: true,
		section: 'last-period',
		orgCode: null,
	});
	assert.deepEqual(parseReportSource('org: nutra\nsection: Weekly\n'), {
		ok: true,
		section: 'weekly',
		orgCode: 'nutra',
	});
	assert.equal(parseReportSource('').ok, false);
	assert.equal(parseReportSource('last-period\ndaily').ok, false);
	assert.equal(parseReportSource('org:\nlast-period').ok, false);
	assert.equal(parseReportSource('org: A\norg: B\ndaily').ok, false);
	assert.equal(parseReportSource('month\n').ok, false);
});

test('closed intervals stay with their organization and drop an open or unusable end', () => {
	const tasks: ReportTaskInput[] = [
		{
			org: 'nutra',
			project: 'Nutra work',
			billable: true,
			rollupProjects: [],
			taskPath: 'Tasks/one.md',
			entries: [
				{ start: '2026-11-06T23:16:27-08:00', end: '2026-11-07T01:01:00-08:00' },
				{ start: '2026-11-06T11:51:04-08:00', end: null },
				{ start: 'not-a-stamp', end: '2026-11-06T12:00:00-08:00' },
				{ start: '2026-11-06T12:00:00-08:00', end: '2026-11-06T11:00:00-08:00' },
			],
		},
		{
			org: 'muse',
			project: 'Other',
			billable: false,
			rollupProjects: [],
			taskPath: 'Tasks/other.md',
			entries: [{ start: '2026-11-06T09:00:00-08:00', end: '2026-11-06T10:00:00-08:00' }],
		},
	];
	const intervals = intervalsForOrganization(tasks, 'NUTRA');
	assert.equal(intervals.length, 1);
	assert.equal(intervals[0]?.startDate, '2026-11-06');
	assert.equal(intervals[0]?.startTime, '23:16:27');
	assert.equal(intervals[0]?.endTime, '01:01:00');
	assert.equal(intervals[0]?.project, 'Nutra work');
	assert.ok(Math.abs((intervals[0]?.minutes ?? 0) - (104 + 33 / 60)) < 1e-9);
});

test('last period is the previous Monday–Sunday week and keeps a midnight crossing on the start date', () => {
	const intervals = intervalsForOrganization(
		[
			{
				org: 'NUTRA',
				project: 'Nutra work',
				billable: true,
				rollupProjects: [],
				taskPath: 'Tasks/nutra-work-00142.md',
				entries: [
					{ start: '2026-11-06T23:16:27-08:00', end: '2026-11-07T01:01:00-08:00' },
					{ start: '2026-11-13T09:00:00-08:00', end: '2026-11-13T10:00:00-08:00' },
				],
			},
		],
		'nutra',
	);
	const report = buildReport('last-period', intervals, decimalMonday, '2026-11-15');
	assert.equal(report.title, 'Last Period Detail (Monday–Sunday)');
	assert.equal(report.empty, null);
	assert.equal(report.groups.length, 1);
	assert.equal(report.groups[0]?.heading, '2026-11-06 - 1.74 hours (1.74 billable)');
	assert.deepEqual(report.groups[0]?.table.rows[0]?.cells, [
		'23:16:27',
		'01:01:00',
		'1.74',
		'billable',
		'Nutra work',
		'nutra-work-00142',
	]);
	assert.equal(report.groups[0]?.table.rows[0]?.taskPath, 'Tasks/nutra-work-00142.md');
});

test('a Saturday–Friday last period excludes the Friday before that Saturday', () => {
	const intervals = [
		row({ startDate: '2026-11-06', minutes: 60 }),
		row({ startDate: '2026-11-08', minutes: 30, billable: false }),
	];
	const report = buildReport(
		'last-period',
		intervals,
		{ ...decimalMonday, weekStart: 'saturday' },
		'2026-11-15',
	);
	assert.equal(report.title, 'Last Period Detail (Saturday–Friday)');
	assert.equal(report.groups.length, 1);
	assert.equal(report.groups[0]?.heading, '2026-11-08 - 0.50 hours (0.50 non-billable)');
});

test('12-hour clocks do not change the duration column', () => {
	const report = buildReport(
		'last-period',
		[row({ startDate: '2026-11-06', startTime: '23:16:27', endTime: '01:01:00', minutes: 104.55 })],
		{ ...decimalMonday, clockFormat: '12-hour' },
		'2026-11-15',
	);
	assert.equal(report.groups[0]?.table.rows[0]?.cells[0], '11:16:27 PM');
	assert.equal(report.groups[0]?.table.rows[0]?.cells[1], '1:01:00 AM');
	assert.equal(report.groups[0]?.table.rows[0]?.cells[2], '1.74');
});

test('daily totals list dates newest first and print a zero category', () => {
	const report = buildReport(
		'daily',
		[
			row({ startDate: '2026-11-06', minutes: 60, billable: true }),
			row({ startDate: '2026-11-13', minutes: 30, billable: false, startInstant: 2 }),
			row({ startDate: '2026-10-17', minutes: 15, billable: true, startInstant: 3 }),
			row({ startDate: '2026-10-16', minutes: 15, startInstant: 4 }),
		],
		decimalMonday,
		'2026-11-15',
	);
	assert.equal(report.title, 'Daily Totals (Last 30 Days)');
	assert.deepEqual(
		report.groups[0]?.table.rows.map((line) => line.cells),
		[
			['2026-11-13', '0.50', '0.00', '0.50'],
			['2026-11-06', '1.00', '1.00', '0.00'],
			['2026-10-17', '0.25', '0.25', '0.00'],
		],
	);
});

test('weekly totals keep the newest 52 weeks in the 364-day window', () => {
	const intervals: ReportInterval[] = [];
	let date = '2025-11-10';
	for (let index = 0; index < 53; index++) {
		intervals.push(row({ startDate: date, minutes: 60, startInstant: index }));
		const next = shiftISODate(date, 7);
		assert.ok(next);
		date = next;
	}
	assert.equal(date, '2026-11-16');
	// Sunday of the oldest week. Its Monday is before the 364-day cutoff, so the week is inside the window and the 52-row cap drops it.
	intervals.push(row({ startDate: '2025-11-16', minutes: 60, startInstant: -1 }));
	const report = buildReport('weekly', intervals, decimalMonday, '2026-11-15');
	const labels = report.groups[0]?.table.rows.map((line) => line.cells[0]);
	assert.equal(labels?.length, 52);
	assert.equal(labels?.[0], 'Week of 2026-11-09');
	assert.equal(labels?.[51], 'Week of 2025-11-17');
	assert.equal(labels?.includes('Week of 2025-11-10'), false);
});

test('project breakdown sorts projects and repeats the week table', () => {
	const report = buildReport(
		'projects',
		[
			row({ startDate: '2026-11-06', project: 'BBB - Bravo', minutes: 60 }),
			row({ startDate: '2026-11-03', project: 'AAA - Alpha', minutes: 30, billable: false, startInstant: 2 }),
		],
		{ weekStart: 'monday', durationFormat: 'hours-minutes', clockFormat: '24-hour' },
		'2026-11-15',
	);
	assert.equal(report.title, 'Project Breakdown (Last 52 Weeks)');
	assert.deepEqual(
		report.groups.map((group) => group.heading),
		['Project: AAA - Alpha', 'Project: BBB - Bravo'],
	);
	assert.deepEqual(report.groups[0]?.table.rows[0]?.cells, [
		'Week of 2026-11-02',
		'0:30',
		'0:00',
		'0:30',
	]);
	assert.deepEqual(report.groups[1]?.table.rows[0]?.cells, [
		'Week of 2026-11-02',
		'1:00',
		'1:00',
		'0:00',
	]);
});

test('a child project interval is included in its ancestor project total', () => {
	const report = buildReport(
		'projects',
		[
			row({
				startDate: '2026-11-06',
				project: 'CHILD - Child',
				rollupProjects: ['PARENT - Parent'],
				minutes: 60,
			}),
		],
		{ weekStart: 'monday', durationFormat: 'hours-minutes', clockFormat: '24-hour' },
		'2026-11-15',
	);
	assert.deepEqual(
		report.groups.map((group) => group.heading),
		['Project: CHILD - Child', 'Project: PARENT - Parent'],
	);
	assert.equal(report.groups[0]?.table.rows[0]?.cells[1], '1:00');
	assert.equal(report.groups[1]?.table.rows[0]?.cells[1], '1:00');
});

test('an empty window keeps the heading and says so', () => {
	const report = buildReport('last-period', [], decimalMonday, '2026-11-15');
	assert.equal(report.title, 'Last Period Detail (Monday–Sunday)');
	assert.equal(report.empty, 'No entries found for the last Monday–Sunday week period.');
	assert.deepEqual(report.groups, []);
});

function row(partial: Partial<ReportInterval> & { startDate: string }): ReportInterval {
	return {
		startTime: '09:00:00',
		endTime: '10:00:00',
		startInstant: 1,
		minutes: 60,
		billable: true,
		project: 'Nutra work',
		rollupProjects: [],
		taskPath: 'Tasks/one.md',
		...partial,
	};
}
