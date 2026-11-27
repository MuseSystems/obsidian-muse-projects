import { MarkdownRenderChild, TFile, type MarkdownPostProcessorContext } from 'obsidian';
import {
	MSPRJ_PRJ_CODE,
	MSPRJ_PRJ_GENERAL_ADMIN,
	MSPRJ_PRJ_NAME,
	MSPRJ_PRJ_ORG,
	MSPRJ_PRJ_STATUS,
	MSPRJ_PRJ_TARGET_END,
	MSPRJ_REPORT_ORG,
	MSPRJ_TSK_ORG,
	MSPRJ_TSK_TIME_ENTRIES,
} from './constants';
import {
	organizationReportClockFormat,
	type ClockFormat,
} from './clockFormat';
import { organizationReportDurationFormat, type DurationFormat } from './durationFormat';
import type MuseProjectsPlugin from './main';
import { findOrganizationByCode, readOrganization, type OrganizationNote } from './orgIndex';
import { rollupProjectsForTask } from './ownershipResolve';
import { listProjectNotes } from './projectIndex';
import { normalizeOrganizationCode } from './slug';
import { createTaskControl, type TaskControlHandle } from './taskControl';
import { taskNoteFromFile, taskProjectIdentity } from './taskNote';
import { todayLocalISODate } from './dates';
import { readTimeEntries } from './timeEntries';
import {
	buildReport,
	intervalsForOrganization,
	parseReportSource,
	projectNoteDescription,
	projectReportLabel,
	type ReportModel,
	type ReportProjectRef,
	type ReportRow,
	type ReportSectionId,
	type ReportTaskInput,
} from './timeReport';
import { organizationReportWeekStart, type WeekStart } from './weekStart';

interface ResolvedReport {
	section: ReportSectionId;
	org: OrganizationNote;
	weekStart: WeekStart;
	durationFormat: DurationFormat;
	clockFormat: ClockFormat;
}

/** Render one `msprj-time-report` block and redraw it when task metadata changes. */
export class TimeReportBlock extends MarkdownRenderChild {
	private alive = true;
	private timer: number | null = null;
	private generation = 0;
	private handles: TaskControlHandle[] = [];

	constructor(
		containerEl: HTMLElement,
		private readonly source: string,
		private readonly ctx: MarkdownPostProcessorContext,
		private readonly plugin: MuseProjectsPlugin,
	) {
		super(containerEl);
	}

	onload(): void {
		this.registerEvent(this.plugin.app.metadataCache.on('changed', () => this.schedule()));
		this.registerEvent(this.plugin.app.metadataCache.on('resolved', () => this.schedule()));
		this.registerEvent(this.plugin.app.vault.on('delete', () => this.schedule()));
		this.registerEvent(this.plugin.app.vault.on('rename', () => this.schedule()));
		this.render();
	}

	onunload(): void {
		this.alive = false;
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		this.releaseLinks();
	}

	private schedule(): void {
		if (!this.alive || this.timer !== null) {
			return;
		}
		this.timer = window.setTimeout(() => {
			this.timer = null;
			if (this.alive) {
				this.render();
			}
		}, 50);
	}

	private render(): void {
		const generation = ++this.generation;
		void this.paint(generation);
	}

	private async paint(generation: number): Promise<void> {
		const el = this.containerEl;
		const parsed = parseReportSource(this.source);
		if (!parsed.ok) {
			if (generation !== this.generation) {
				return;
			}
			this.releaseLinks();
			el.empty();
			el.classList.add('msprj-time-report');
			delete el.dataset.section;
			el.createEl('p', { cls: 'msprj-time-report-empty', text: parsed.message });
			return;
		}

		const resolved = this.resolve(parsed.section, parsed.orgCode);
		if (!resolved.ok) {
			if (generation !== this.generation) {
				return;
			}
			this.releaseLinks();
			el.empty();
			el.classList.add('msprj-time-report');
			delete el.dataset.section;
			el.createEl('p', { cls: 'msprj-time-report-empty', text: resolved.message });
			return;
		}

		const collected = collectTasks(this.plugin, resolved.report.org.code);
		const projects =
			resolved.report.section === 'active-projects'
				? await collectProjects(this.plugin, resolved.report.org.code)
				: [];
		if (!this.alive || generation !== this.generation) {
			return;
		}
		this.releaseLinks();
		el.empty();
		el.classList.add('msprj-time-report');
		el.dataset.section = resolved.report.section;
		const model = buildReport(
			resolved.report.section,
			intervalsForOrganization(collected.tasks, resolved.report.org.code),
			{
				weekStart: resolved.report.weekStart,
				durationFormat: resolved.report.durationFormat,
				clockFormat: resolved.report.clockFormat,
			},
			todayLocalISODate(),
			projects,
		);
		drawReport(el, model, collected.skipped);
		this.mountLinks(el);
	}

	private resolve(
		section: ReportSectionId,
		fenceOrg: string | null,
	): { ok: true; report: ResolvedReport } | { ok: false; message: string } {
		const org = this.organization(fenceOrg);
		if (!org.ok) {
			return org;
		}
		const settings = this.plugin.settings;
		return {
			ok: true,
			report: {
				section,
				org: org.org,
				weekStart: organizationReportWeekStart(org.org.weekStart, settings.weekStart),
				durationFormat: organizationReportDurationFormat(
					org.org.durationFormat,
					settings.durationFormat,
				),
				clockFormat: organizationReportClockFormat(org.org.clockFormat, settings.clockFormat),
			},
		};
	}

	private organization(
		fenceOrg: string | null,
	): { ok: true; org: OrganizationNote } | { ok: false; message: string } {
		const templatesPath = this.plugin.settings.projectTemplatesPath;
		if (fenceOrg !== null) {
			const named = findOrganizationByCode(this.plugin.app, fenceOrg, templatesPath);
			if (!named) {
				const code = normalizeOrganizationCode(fenceOrg) || fenceOrg.trim();
				return { ok: false, message: `No organization note uses code ${code}.` };
			}
			return { ok: true, org: named };
		}

		const file = this.plugin.app.vault.getFileByPath(this.ctx.sourcePath);
		const fm =
			file instanceof TFile
				? this.plugin.app.metadataCache.getFileCache(file)?.frontmatter
				: undefined;
		const self = file instanceof TFile ? readOrganization(file, fm) : null;
		if (self) {
			return { ok: true, org: self };
		}

		const raw = fm?.[MSPRJ_REPORT_ORG];
		if (typeof raw === 'string' && raw.trim()) {
			const named = findOrganizationByCode(this.plugin.app, raw, templatesPath);
			if (!named) {
				const code = normalizeOrganizationCode(raw) || raw.trim();
				return { ok: false, message: `No organization note uses code ${code}.` };
			}
			return { ok: true, org: named };
		}

		return {
			ok: false,
			message: `This note does not name an organization. Use an organization note, or set ${MSPRJ_REPORT_ORG} to an organization code.`,
		};
	}

	private mountLinks(root: HTMLElement): void {
		for (const node of Array.from(root.querySelectorAll('a.internal-link'))) {
			if (!(node instanceof HTMLAnchorElement)) {
				continue;
			}
			const raw = node.getAttribute('data-href') ?? '';
			let href = raw;
			try {
				href = decodeURIComponent(raw);
			} catch {
				href = raw;
			}
			const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(href, this.ctx.sourcePath);
			if (!(dest instanceof TFile)) {
				continue;
			}
			const task = taskNoteFromFile(
				this.plugin.app,
				dest,
				this.plugin.settings.projectTemplatesPath,
			);
			if (!task) {
				continue;
			}
			const { el, handle } = createTaskControl(node.ownerDocument, this.plugin, {
				file: task.file,
				sourcePath: this.ctx.sourcePath,
				mode: 'link',
				open: false,
				track: true,
			});
			node.replaceWith(el);
			this.handles.push(handle);
		}
	}

	private releaseLinks(): void {
		for (const handle of this.handles) {
			handle.unload();
		}
		this.handles = [];
	}
}

function collectTasks(
	plugin: MuseProjectsPlugin,
	orgCode: string,
): { tasks: ReportTaskInput[]; skipped: { path: string; reason: string }[] } {
	const tasks: ReportTaskInput[] = [];
	const skipped: { path: string; reason: string }[] = [];
	const target = normalizeOrganizationCode(orgCode);
	for (const file of plugin.app.vault.getMarkdownFiles()) {
		const task = taskNoteFromFile(plugin.app, file, plugin.settings.projectTemplatesPath);
		if (!task) {
			continue;
		}
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		const orgRaw = fm?.[MSPRJ_TSK_ORG];
		const org = typeof orgRaw === 'string' ? normalizeOrganizationCode(orgRaw) : '';
		if (!org || org !== target) {
			continue;
		}
		const raw = fm?.[MSPRJ_TSK_TIME_ENTRIES];
		const read = readTimeEntries(raw === undefined ? [] : raw);
		if (!read.ok) {
			skipped.push({ path: file.path, reason: read.reason });
			continue;
		}
		const project = taskProjectIdentity(plugin.app, file);
		const rollupProjects = rollupProjectsForTask(plugin.app, file).map((ancestor) =>
			projectReportLabel(ancestor.code, ancestor.name),
		);
		tasks.push({
			org,
			project: projectReportLabel(project.code, project.name),
			billable: task.billable,
			rollupProjects,
			taskPath: file.path,
			entries: read.entries.map((entry) => ({ start: entry.start, end: entry.end })),
		});
	}
	return { tasks, skipped };
}

async function collectProjects(
	plugin: MuseProjectsPlugin,
	orgCode: string,
): Promise<ReportProjectRef[]> {
	const target = normalizeOrganizationCode(orgCode);
	const projects: ReportProjectRef[] = [];
	for (const file of listProjectNotes(plugin.app, plugin.settings.projectTemplatesPath)) {
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) {
			continue;
		}
		const orgRaw = fm[MSPRJ_PRJ_ORG];
		const org = typeof orgRaw === 'string' ? normalizeOrganizationCode(orgRaw) : '';
		if (!org || org !== target) {
			continue;
		}
		const codeRaw = fm[MSPRJ_PRJ_CODE];
		const nameRaw = fm[MSPRJ_PRJ_NAME];
		const statusRaw = fm[MSPRJ_PRJ_STATUS];
		let description = '';
		try {
			description = projectNoteDescription(await plugin.app.vault.cachedRead(file));
		} catch {
			description = '';
		}
		projects.push({
			code: typeof codeRaw === 'string' ? codeRaw.trim() : '',
			name: typeof nameRaw === 'string' ? nameRaw.trim() : '',
			path: file.path,
			status: typeof statusRaw === 'string' ? statusRaw.trim() : '',
			generalAdmin: fm[MSPRJ_PRJ_GENERAL_ADMIN] === true,
			due: dateText(fm[MSPRJ_PRJ_TARGET_END]),
			description,
		});
	}
	return projects;
}

function dateText(value: unknown): string {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const month = String(value.getMonth() + 1).padStart(2, '0');
		const day = String(value.getDate()).padStart(2, '0');
		return `${value.getFullYear()}-${month}-${day}`;
	}
	if (typeof value !== 'string') {
		return '';
	}
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
	return match?.[1] ?? '';
}

function drawReport(
	el: HTMLElement,
	model: ReportModel,
	skipped: { path: string; reason: string }[],
): void {
	el.createEl('h2', { cls: 'msprj-time-report-title', text: model.title });
	if (model.empty) {
		el.createEl('p', { cls: 'msprj-time-report-empty', text: model.empty });
	}
	for (const group of model.groups) {
		if (group.heading) {
			el.createEl('h4', { cls: 'msprj-time-report-group', text: group.heading });
		}
		drawTable(el, group.table.headers, group.table.rows);
	}
	for (const item of skipped) {
		el.createEl('p', {
			cls: 'msprj-time-report-skip',
			text: `Skipped ${item.path}: ${item.reason}`,
		});
	}
}

function cellHref(row: ReportRow, index: number): string | null {
	if (typeof row.linkIndex === 'number') {
		return index === row.linkIndex ? (row.linkPath ?? null) : null;
	}
	if (row.taskPath && index === row.cells.length - 1) {
		return row.taskPath;
	}
	return null;
}

function drawTable(el: HTMLElement, headers: string[], rows: ReportRow[]): void {
	const table = el.createEl('table', { cls: 'msprj-time-report-table' });
	const head = table.createEl('thead').createEl('tr');
	headers.forEach((header, index) => {
		const th = head.createEl('th');
		th.setText(header);
		if (index === 0) {
			th.createSpan({ cls: 'msprj-time-report-count', text: ` (${rows.length})` });
		}
	});
	const body = table.createEl('tbody');
	for (const row of rows) {
		const tr = body.createEl('tr');
		row.cells.forEach((cell, index) => {
			const td = tr.createEl('td');
			const href = cellHref(row, index);
			if (href) {
				const link = td.createEl('a', { cls: 'internal-link', text: cell, href });
				link.setAttribute('data-href', href);
				return;
			}
			td.setText(cell);
		});
	}
}
