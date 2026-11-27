import { type ClockFormat, formatReportedClock } from './clockFormat';
import { shiftISODate } from './dates';
import { type DurationFormat, formatReportedDuration } from './durationFormat';
import { normalizeOrganizationCode } from './slug';
import { parseStamp } from './stamps';
import {
	previousWeek,
	WEEK_START_LABELS,
	weekContaining,
	type WeekStart,
} from './weekStart';

/** Code-block language. The body is one section token and an optional `org:` line. */
export const TIME_REPORT_LANGUAGE = 'msprj-time-report';

export const REPORT_SECTIONS = ['active-projects', 'last-period', 'daily', 'weekly', 'projects'] as const;

export type ReportSectionId = (typeof REPORT_SECTIONS)[number];

/** Closed intervals the report can place. Times are the civil `HH:mm:ss` on the stamp. */
export interface ReportInterval {
	startDate: string;
	startTime: string;
	endTime: string;
	startInstant: number;
	minutes: number;
	billable: boolean;
	/** Label of the project that owns the task. */
	project: string;
	/** Ancestor project labels, nearest parent first. Their totals include this interval. */
	rollupProjects: readonly string[];
	taskPath: string;
}

/** One task's closed and open intervals, before the report drops the open ones. */
export interface ReportTaskInput {
	org: string;
	project: string;
	billable: boolean;
	/** Ancestor project labels, nearest parent first. */
	rollupProjects: readonly string[];
	taskPath: string;
	entries: { start: string; end: string | null }[];
}

export interface ReportFormats {
	weekStart: WeekStart;
	durationFormat: DurationFormat;
	clockFormat: ClockFormat;
}

export interface ReportRow {
	cells: string[];
	/** Set on a detail row. The last cell is the link text. */
	taskPath: string | null;
	/** Set when a cell other than the last one links to a note. */
	linkIndex?: number;
	linkPath?: string;
}

export interface ReportTable {
	headers: string[];
	rows: ReportRow[];
}

export interface ReportGroup {
	/** Day or project heading. Null for a section that is one table. */
	heading: string | null;
	table: ReportTable;
}

/** A project note the active-projects block can list. */
export interface ReportProjectRef {
	code: string;
	name: string;
	path: string;
	status: string;
	/** `msprj_prj_general_admin`. Set projects are omitted. */
	generalAdmin: boolean;
	/** `msprj_prj_target_end`, shown as Target Date. Empty when unset. */
	due: string;
	/** First body paragraph, or empty. */
	description: string;
}

/** One directory row. `path` is the project note. */
export interface ReportModel {
	title: string;
	/** Set when the section has no rows. */
	empty: string | null;
	groups: ReportGroup[];
}

/** Status value that puts a project in the active-projects block. */
export const ACTIVE_PROJECT_STATUS = 'active';

export type ReportSource =
	| { ok: true; section: ReportSectionId; orgCode: string | null }
	| { ok: false; message: string };

/** Inclusive calendar days ending today. The shift back is one less than this count. */
const DAILY_WINDOW_DAYS = 30;
/** 52 weeks of 7 calendar days. The window is measured back from local today. */
const WEEK_WINDOW_DAYS = 52 * 7;
const MAX_WEEK_ROWS = 52;

const DETAIL_HEADERS = ['Start', 'End', 'Hours', 'Category', 'Project', 'File'];
const TOTAL_HEADERS = ['Date', 'Total Hours', 'Billable', 'Non-billable'];
const WEEK_HEADERS = ['Week', 'Total Hours', 'Billable', 'Non-billable'];

/**
 * Project label for a report.
 * Both parts, and they differ: `{code} - {name}`. Otherwise the one part that is present.
 */
export function projectReportLabel(code: string, name: string): string {
	const trimmedCode = code.trim();
	const trimmedName = name.trim();
	if (trimmedCode && trimmedName && trimmedCode !== trimmedName) {
		return `${trimmedCode} - ${trimmedName}`;
	}
	return trimmedName || trimmedCode;
}

const ACTIVE_PROJECT_HEADERS = ['Code', 'Name', 'Target Date', 'Status', 'Description'];

/**
 * Description text for an active-projects row.
 * Frontmatter, headings, fenced code, thematic breaks, lists, and a line that is
 * only a link are skipped. The first remaining paragraph is the description.
 * Later paragraphs are not included.
 */
export function projectNoteDescription(markdown: string): string {
	const body = markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	const lines = body.split(/\r?\n/);
	let inFence = false;
	const paragraph: string[] = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (/^(`{3,}|~{3,})/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			continue;
		}
		if (!line) {
			if (paragraph.length > 0) {
				break;
			}
			continue;
		}
		if (line.startsWith('#')) {
			continue;
		}
		if (/^([-*_])\1{2,}$/.test(line)) {
			continue;
		}
		if (/^!?\[\[[^\]]+\]\]$/.test(line) || /^!?\[[^\]]*\]\([^)]*\)$/.test(line)) {
			continue;
		}
		if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
			continue;
		}
		paragraph.push(line.replace(/^>\s?/, ''));
	}
	return paragraph.join(' ').replace(/\s+/g, ' ').trim();
}

/** The section blocks, in report order, for an organization note template. */
export function organizationReportBlocks(): string {
	return REPORT_SECTIONS.map((section) => `\`\`\`${TIME_REPORT_LANGUAGE}\n${section}\n\`\`\``).join(
		'\n\n',
	);
}

/** Read a code-block body. A bare section token is enough. `org: CODE` overrides the note. */
export function parseReportSource(source: string): ReportSource {
	let section: ReportSectionId | null = null;
	let orgCode: string | null = null;
	for (const raw of source.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) {
			continue;
		}
		const org = /^org\s*:\s*(.*)$/i.exec(line);
		if (org) {
			if (orgCode !== null) {
				return { ok: false, message: 'The block names more than one organization.' };
			}
			const code = (org[1] ?? '').trim();
			if (!code) {
				return { ok: false, message: 'The org line needs an organization code.' };
			}
			orgCode = code;
			continue;
		}
		const sectionLine = /^(?:section\s*:\s*)?([a-z0-9-]+)$/i.exec(line);
		if (!sectionLine) {
			return { ok: false, message: `Unknown line "${line}".` };
		}
		const token = (sectionLine[1] ?? '').toLowerCase();
		if (!isSection(token)) {
			return {
				ok: false,
				message: `Unknown section "${token}". Use active-projects, last-period, daily, weekly, or projects.`,
			};
		}
		if (section) {
			return { ok: false, message: 'The block names more than one section.' };
		}
		section = token;
	}
	if (!section) {
		return {
			ok: false,
			message: 'The block needs a section: active-projects, last-period, daily, weekly, or projects.',
		};
	}
	return { ok: true, section, orgCode };
}

/**
 * Closed intervals for one organization.
 * An open end, a stamp that does not parse, and an end that is not after its start are omitted.
 * Tasks for other organizations are omitted.
 */
export function intervalsForOrganization(
	tasks: readonly ReportTaskInput[],
	orgCode: string,
): ReportInterval[] {
	const target = normalizeOrganizationCode(orgCode);
	if (!target) {
		return [];
	}
	const intervals: ReportInterval[] = [];
	for (const task of tasks) {
		if (normalizeOrganizationCode(task.org) !== target) {
			continue;
		}
		for (const entry of task.entries) {
			const start = parseStamp(entry.start);
			const end = entry.end === null ? null : parseStamp(entry.end);
			if (!start || !end || end.instant <= start.instant) {
				continue;
			}
			intervals.push({
				startDate: start.date,
				startTime: start.time,
				endTime: end.time,
				startInstant: start.instant,
				minutes: (end.instant - start.instant) / 60_000,
				billable: task.billable,
				project: task.project,
				rollupProjects: task.rollupProjects,
				taskPath: task.taskPath,
			});
		}
	}
	return intervals;
}

/**
 * Build one section. `today` is the local calendar date the windows are measured from.
 * `projects` supplies the organization directory for `active-projects`.
 */
export function buildReport(
	section: ReportSectionId,
	intervals: readonly ReportInterval[],
	formats: ReportFormats,
	today: string,
	projects: readonly ReportProjectRef[] = [],
): ReportModel {
	if (section === 'active-projects') {
		return activeProjects(projects);
	}
	const title = sectionTitle(section, formats.weekStart);
	if (section === 'last-period') {
		const week = previousWeek(today, formats.weekStart);
		if (!week) {
			return { title, empty: 'Today is not a calendar date.', groups: [] };
		}
		const rows = intervals
			.filter((row) => row.startDate >= week.start && row.startDate <= week.end)
			.sort(byStart);
		return finish(title, section, formats.weekStart, detailGroups(rows, formats));
	}

	const from = shiftISODate(
		today,
		section === 'daily' ? -(DAILY_WINDOW_DAYS - 1) : -WEEK_WINDOW_DAYS,
	);
	if (!from) {
		return { title, empty: 'Today is not a calendar date.', groups: [] };
	}
	const rows = intervals.filter((row) => row.startDate >= from);
	if (section === 'daily') {
		return finish(title, section, formats.weekStart, dailyGroups(rows, formats.durationFormat));
	}
	if (section === 'weekly') {
		return finish(title, section, formats.weekStart, [
			{
				heading: null,
				table: weekTable(rows, formats.weekStart, formats.durationFormat),
			},
		]);
	}
	return finish(title, section, formats.weekStart, projectGroups(rows, formats));
}

function finish(
	title: string,
	section: ReportSectionId,
	weekStart: WeekStart,
	groups: ReportGroup[],
): ReportModel {
	const visible = groups.filter((group) => group.table.rows.length > 0);
	if (visible.length === 0) {
		return { title, empty: emptyMessage(section, weekStart), groups: [] };
	}
	return { title, empty: null, groups: visible };
}

function activeProjects(projects: readonly ReportProjectRef[]): ReportModel {
	const rows = projects
		.filter((project) => project.status.trim().toLowerCase() === ACTIVE_PROJECT_STATUS)
		.filter((project) => !project.generalAdmin)
		.filter((project) => project.path)
		.slice()
		.sort(
			(a, b) =>
				a.code.localeCompare(b.code) ||
				a.name.localeCompare(b.name) ||
				a.path.localeCompare(b.path),
		);
	if (rows.length === 0) {
		return {
			title: 'Active Projects',
			empty: 'No active projects.',
			groups: [],
		};
	}
	return {
		title: 'Active Projects',
		empty: null,
		groups: [
			{
				heading: null,
				table: {
					headers: [...ACTIVE_PROJECT_HEADERS],
					rows: rows.map((project) => ({
						cells: [
							project.code,
							project.name,
							project.due,
							project.status.trim(),
							project.description,
						],
						taskPath: null,
						linkIndex: 1,
						linkPath: project.path,
					})),
				},
			},
		],
	};
}

function detailGroups(rows: readonly ReportInterval[], formats: ReportFormats): ReportGroup[] {
	const byDay = groupBy(rows, (row) => row.startDate);
	const dates = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
	return dates.map((date) => {
		const dayRows = (byDay.get(date) ?? []).slice().sort(byStart);
		return {
			heading: dayHeading(date, dayRows, formats.durationFormat),
			table: {
				headers: [...DETAIL_HEADERS],
				rows: dayRows.map((row) => detailRow(row, formats)),
			},
		};
	});
}

function dailyGroups(rows: readonly ReportInterval[], format: DurationFormat): ReportGroup[] {
	const byDay = groupBy(rows, (row) => row.startDate);
	const dates = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
	return [
		{
			heading: null,
			table: {
				headers: [...TOTAL_HEADERS],
				rows: dates.map((date) => totalsRow(date, byDay.get(date) ?? [], format)),
			},
		},
	];
}

function weekTable(
	rows: readonly ReportInterval[],
	weekStart: WeekStart,
	format: DurationFormat,
): ReportTable {
	const byWeek = new Map<string, ReportInterval[]>();
	for (const row of rows) {
		const week = weekContaining(row.startDate, weekStart);
		if (!week) {
			continue;
		}
		const list = byWeek.get(week.start);
		if (list) {
			list.push(row);
		} else {
			byWeek.set(week.start, [row]);
		}
	}
	const keys = [...byWeek.keys()].sort((a, b) => b.localeCompare(a)).slice(0, MAX_WEEK_ROWS);
	return {
		headers: [...WEEK_HEADERS],
		rows: keys.map((key) => totalsRow(`Week of ${key}`, byWeek.get(key) ?? [], format)),
	};
}

function projectGroups(rows: readonly ReportInterval[], formats: ReportFormats): ReportGroup[] {
	const byProject = new Map<string, ReportInterval[]>();
	for (const row of rows) {
		const seen = new Set<string>();
		for (const key of [row.project, ...row.rollupProjects]) {
			if (seen.has(key)) continue;
			seen.add(key);
			const list = byProject.get(key);
			if (list) list.push(row);
			else byProject.set(key, [row]);
		}
	}
	const names = [...byProject.keys()].sort((a, b) => a.localeCompare(b));
	return names.map((name) => ({
		heading: `Project: ${name || '(no project)'}`,
		table: weekTable(byProject.get(name) ?? [], formats.weekStart, formats.durationFormat),
	}));
}

function detailRow(row: ReportInterval, formats: ReportFormats): ReportRow {
	const slash = Math.max(row.taskPath.lastIndexOf('/'), row.taskPath.lastIndexOf('\\'));
	const base = slash >= 0 ? row.taskPath.slice(slash + 1) : row.taskPath;
	const label = base.toLowerCase().endsWith('.md') ? base.slice(0, -3) : base;
	return {
		cells: [
			formatReportedClock(row.startTime, formats.clockFormat) ?? row.startTime,
			formatReportedClock(row.endTime, formats.clockFormat) ?? row.endTime,
			show(row.minutes, formats.durationFormat),
			row.billable ? 'billable' : 'non-billable',
			row.project,
			label,
		],
		taskPath: row.taskPath,
	};
}

function totalsRow(label: string, rows: readonly ReportInterval[], format: DurationFormat): ReportRow {
	const sums = sumSplit(rows);
	return {
		cells: [label, show(sums.total, format), show(sums.billable, format), show(sums.nonbillable, format)],
		taskPath: null,
	};
}

function dayHeading(date: string, rows: readonly ReportInterval[], format: DurationFormat): string {
	const sums = sumSplit(rows);
	return `${date} - ${show(sums.total, format)} hours${categorySuffix(sums, format)}`;
}

function categorySuffix(
	sums: { billable: number; nonbillable: number },
	format: DurationFormat,
): string {
	const zero = formatReportedDuration(0, format);
	const parts: string[] = [];
	const billable = formatReportedDuration(sums.billable, format);
	const nonbillable = formatReportedDuration(sums.nonbillable, format);
	if (billable && billable !== zero) {
		parts.push(`${billable} billable`);
	}
	if (nonbillable && nonbillable !== zero) {
		parts.push(`${nonbillable} non-billable`);
	}
	return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function sumSplit(rows: readonly ReportInterval[]): {
	total: number;
	billable: number;
	nonbillable: number;
} {
	let total = 0;
	let billable = 0;
	let nonbillable = 0;
	for (const row of rows) {
		total += row.minutes;
		if (row.billable) {
			billable += row.minutes;
		} else {
			nonbillable += row.minutes;
		}
	}
	return { total, billable, nonbillable };
}

function show(minutes: number, format: DurationFormat): string {
	return formatReportedDuration(minutes, format) ?? '';
}

function byStart(a: ReportInterval, b: ReportInterval): number {
	return a.startInstant - b.startInstant || a.taskPath.localeCompare(b.taskPath);
}

function groupBy(
	rows: readonly ReportInterval[],
	key: (row: ReportInterval) => string,
): Map<string, ReportInterval[]> {
	const map = new Map<string, ReportInterval[]>();
	for (const row of rows) {
		const id = key(row);
		const list = map.get(id);
		if (list) {
			list.push(row);
		} else {
			map.set(id, [row]);
		}
	}
	return map;
}

function sectionTitle(section: ReportSectionId, weekStart: WeekStart): string {
	switch (section) {
		case 'active-projects':
			return 'Active Projects';
		case 'last-period':
			return `Last Period Detail (${WEEK_START_LABELS[weekStart]})`;
		case 'daily':
			return 'Daily Totals (Last 30 Days)';
		case 'weekly':
			return 'Weekly Totals (Last 52 Weeks)';
		case 'projects':
			return 'Project Breakdown (Last 52 Weeks)';
	}
}

function emptyMessage(section: ReportSectionId, weekStart: WeekStart): string {
	switch (section) {
		case 'active-projects':
			return 'No active projects.';
		case 'last-period':
			return `No entries found for the last ${WEEK_START_LABELS[weekStart]} week period.`;
		case 'daily':
			return 'No entries found in the last 30 days.';
		case 'weekly':
		case 'projects':
			return 'No entries found in the last 52 weeks.';
	}
}

function isSection(value: string): value is ReportSectionId {
	return (REPORT_SECTIONS as readonly string[]).includes(value);
}
