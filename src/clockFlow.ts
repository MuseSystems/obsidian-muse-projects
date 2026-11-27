import {
	App,
	FuzzySuggestModal,
	getFrontMatterInfo,
	Notice,
	parseYaml,
	TFile,
} from 'obsidian';
import { MSPRJ_TSK_TIME_ENTRIES } from './constants';
import type MuseProjectsPlugin from './main';
import { closeOpenInterval, appendOpenInterval, notBeforeMessage } from './clockMutations';
import { parseStamp, stampNow } from './stamps';
import { listTaskNotes, taskNoteFromFile, type TaskNoteRef } from './taskNote';
import { owningTaskOfTodo, todoNoteFromFile } from './todoNote';
import {
	entriesToYaml,
	prepareForWrite,
	readTimeEntries,
	timeEntriesEqual,
	type TimeEntry,
	type TimeEntryRead,
} from './timeEntries';

export class TimeEntryWriteError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TimeEntryWriteError';
	}
}

/** The time-entry list itself could not be read. Edit time may offer to replace it. */
export class UnreadableTimeEntriesError extends TimeEntryWriteError {
	constructor(message: string) {
		super(message);
		this.name = 'UnreadableTimeEntriesError';
	}
}

export interface OpenClock {
	file: TFile;
	id: string;
	start: string;
	startInstant: number;
	code: string;
	title: string;
}

export interface ClockScan {
	opens: OpenClock[];
	unreadable: { path: string; reason: string }[];
}

function activeMarkdownFile(app: App): TFile | null {
	const file = app.workspace.getActiveFile();
	return file instanceof TFile && file.extension === 'md' ? file : null;
}

/** metadataCache scan. The note on disk is what a later write reads. */
export function scanClocks(app: App, templatesPath: string): ClockScan {
	const opens: OpenClock[] = [];
	const unreadable: { path: string; reason: string }[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const task = taskNoteFromFile(app, file, templatesPath);
		if (!task) {
			continue;
		}
		const raw = app.metadataCache.getFileCache(file)?.frontmatter?.[MSPRJ_TSK_TIME_ENTRIES];
		const read = readTimeEntries(raw === undefined ? [] : raw);
		if (!read.ok) {
			unreadable.push({ path: file.path, reason: read.reason });
			continue;
		}
		for (const entry of read.entries) {
			if (entry.end !== null) {
				continue;
			}
			const start = parseStamp(entry.start);
			if (!start) {
				unreadable.push({ path: file.path, reason: 'Open interval start is not a stamp.' });
				continue;
			}
			opens.push({
				file,
				id: entry.id,
				start: entry.start,
				startInstant: start.instant,
				code: task.code,
				title: task.title,
			});
		}
	}

	return { opens, unreadable };
}

export function openClockRefusalMessage(opens: OpenClock[]): string {
	const codes = opens.map((open) => open.code).join(', ');
	return `${opens.length} open clocks: ${codes}`;
}

function skippedUnreadableSuffix(items: ClockScan['unreadable']): string {
	if (items.length === 0) {
		return '';
	}
	const shown = items
		.slice(0, 3)
		.map((item) => `${item.path} (${item.reason})`)
		.join('; ');
	const more = items.length > 3 ? ` (+${items.length - 3} more)` : '';
	return `Skipped unreadable time entries: ${shown}${more}.`;
}

function noticeWithSkipped(message: string, unreadable: ClockScan['unreadable']): void {
	const suffix = skippedUnreadableSuffix(unreadable);
	new Notice(suffix ? `${message} ${suffix}` : message);
}

function frontmatterRecord(text: string): Record<string, unknown> {
	const info = getFrontMatterInfo(text);
	if (!info.exists) {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = parseYaml(info.frontmatter);
	} catch {
		throw new TimeEntryWriteError('Frontmatter could not be parsed.');
	}
	if (parsed == null) {
		return {};
	}
	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new TimeEntryWriteError('Frontmatter is not an object.');
	}
	return parsed as Record<string, unknown>;
}

export async function loadTimeEntries(app: App, file: TFile): Promise<TimeEntry[]> {
	const text = await app.vault.read(file);
	const fm = frontmatterRecord(text);
	const raw = fm[MSPRJ_TSK_TIME_ENTRIES];
	const read = readTimeEntries(raw === undefined || raw === null ? [] : raw);
	if (!read.ok) {
		throw new UnreadableTimeEntriesError(read.reason);
	}
	return read.entries;
}

/**
 * Replace the list. The confirmed Edit time discard of an unreadable value uses
 * this and does not merge with whatever is on disk.
 */
export async function writeTimeEntries(
	app: App,
	file: TFile,
	entries: TimeEntry[],
): Promise<void> {
	const prepared = prepareForWrite(entries);
	if (!prepared.ok) {
		throw new TimeEntryWriteError(prepared.reason);
	}
	const yamlEntries = entriesToYaml(prepared.entries);
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm[MSPRJ_TSK_TIME_ENTRIES] = yamlEntries;
	});
}

/**
 * Apply `update` to the list processFrontMatter has just read.
 * A refusal or a thrown error happens before the list is assigned, so the file stays as it was.
 */
export async function updateTimeEntries(
	app: App,
	file: TFile,
	update: (entries: TimeEntry[]) => TimeEntryRead,
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		const raw = fm[MSPRJ_TSK_TIME_ENTRIES];
		const read = readTimeEntries(raw === undefined || raw === null ? [] : raw);
		if (!read.ok) {
			throw new TimeEntryWriteError(read.reason);
		}
		const result = update(read.entries);
		if (!result.ok) {
			throw new TimeEntryWriteError(result.reason);
		}
		const prepared = prepareForWrite(result.entries);
		if (!prepared.ok) {
			throw new TimeEntryWriteError(prepared.reason);
		}
		fm[MSPRJ_TSK_TIME_ENTRIES] = entriesToYaml(prepared.entries);
	});
}

/** Edit time: write `next` only when the disk list is still the list the modal opened. */
export async function writeTimeEntriesIfUnchanged(
	app: App,
	file: TFile,
	opened: TimeEntry[],
	next: TimeEntry[],
): Promise<void> {
	await updateTimeEntries(app, file, (current) => {
		if (!timeEntriesEqual(current, opened)) {
			return {
				ok: false,
				reason: 'Time entries changed since this editor opened. Nothing written.',
			};
		}
		return { ok: true, entries: next };
	});
}

class TaskPickModal extends FuzzySuggestModal<TaskNoteRef> {
	constructor(
		app: App,
		private readonly tasks: TaskNoteRef[],
		private readonly onPick: (task: TaskNoteRef) => void,
	) {
		super(app);
		this.setPlaceholder('Choose a task…');
	}

	getItems(): TaskNoteRef[] {
		return this.tasks;
	}

	getItemText(item: TaskNoteRef): string {
		return `${item.code} — ${item.title}`;
	}

	onChooseItem(item: TaskNoteRef): void {
		this.onPick(item);
	}
}

async function clockInTo(app: App, target: TaskNoteRef, templatesPath: string): Promise<void> {
	const scan = scanClocks(app, templatesPath);
	if (scan.opens.length > 1) {
		noticeWithSkipped(openClockRefusalMessage(scan.opens), scan.unreadable);
		return;
	}

	const stamp = stampNow();
	const open = scan.opens[0];
	if (open && open.file.path === target.file.path) {
		noticeWithSkipped(
			`Already clocked in on ${target.code} — ${target.title}.`,
			scan.unreadable,
		);
		return;
	}
	if (open && !(open.startInstant < (parseStamp(stamp)?.instant ?? 0))) {
		noticeWithSkipped(notBeforeMessage(open.code, open.start, stamp), scan.unreadable);
		return;
	}

	if (open) {
		try {
			const closedEntries = await loadTimeEntries(app, open.file);
			const closed = closeOpenInterval(closedEntries, open.id, stamp, open.code);
			if (!closed.ok) {
				noticeWithSkipped(closed.reason, scan.unreadable);
				return;
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			noticeWithSkipped(message, scan.unreadable);
			return;
		}
	}

	try {
		const targetEntries = await loadTimeEntries(app, target.file);
		const appended = appendOpenInterval(targetEntries, stamp, target.code);
		if (!appended.ok) {
			noticeWithSkipped(appended.reason, scan.unreadable);
			return;
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		noticeWithSkipped(
			`${message} Edit time on ${target.code} can replace the list with an empty list.`,
			scan.unreadable,
		);
		return;
	}

	if (open) {
		try {
			await updateTimeEntries(app, open.file, (entries) =>
				closeOpenInterval(entries, open.id, stamp, open.code),
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			noticeWithSkipped(message, scan.unreadable);
			return;
		}
	}

	try {
		await updateTimeEntries(app, target.file, (entries) =>
			appendOpenInterval(entries, stamp, target.code),
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (open) {
			noticeWithSkipped(
				`Clocked out ${open.code} — ${open.title}. Clock in failed: ${message}`,
				scan.unreadable,
			);
		} else {
			noticeWithSkipped(message, scan.unreadable);
		}
		return;
	}

	if (open) {
		noticeWithSkipped(
			`Clocked out ${open.code} — ${open.title}. Clocked in ${target.code} — ${target.title}.`,
			scan.unreadable,
		);
	} else {
		noticeWithSkipped(`Clocked in ${target.code} — ${target.title}.`, scan.unreadable);
	}
}

/** Clock out when this task holds the only open clock. Otherwise clock in, which may switch tasks. */
export async function runTaskClock(plugin: MuseProjectsPlugin, task: TaskNoteRef): Promise<void> {
	const templatesPath = plugin.settings.projectTemplatesPath;
	const scan = scanClocks(plugin.app, templatesPath);
	const open = scan.opens.length === 1 ? scan.opens[0] : undefined;
	if (open && open.file.path === task.file.path) {
		await runClockOut(plugin);
		return;
	}
	await clockInTo(plugin.app, task, templatesPath);
}

/** Clock in on the active task, on the task that owns the active to-do, or fuzzy-pick a task. */
export async function runClockIn(plugin: MuseProjectsPlugin): Promise<void> {
	const { app } = plugin;
	const templatesPath = plugin.settings.projectTemplatesPath;
	const active = activeMarkdownFile(app);
	const fromActive = active ? taskNoteFromFile(app, active, templatesPath) : null;
	if (fromActive) {
		await clockInTo(app, fromActive, templatesPath);
		return;
	}
	if (active && todoNoteFromFile(app, active, templatesPath)) {
		const owner = owningTaskOfTodo(app, active, templatesPath);
		if (!owner) {
			new Notice('This to-do is not owned by a task.');
			return;
		}
		await clockInTo(app, owner, templatesPath);
		return;
	}

	const tasks = listTaskNotes(app, templatesPath);
	if (tasks.length === 0) {
		new Notice('No tasks found.');
		return;
	}
	new TaskPickModal(app, tasks, (task) => {
		void clockInTo(app, task, templatesPath);
	}).open();
}

/** Close the single open interval. More than one open clock is left untouched. */
export async function runClockOut(plugin: MuseProjectsPlugin): Promise<void> {
	const { app } = plugin;
	const scan = scanClocks(app, plugin.settings.projectTemplatesPath);
	if (scan.opens.length > 1) {
		noticeWithSkipped(openClockRefusalMessage(scan.opens), scan.unreadable);
		return;
	}
	const open = scan.opens[0];
	if (!open) {
		noticeWithSkipped('No clock is open.', scan.unreadable);
		return;
	}

	const stamp = stampNow();
	try {
		await updateTimeEntries(app, open.file, (entries) =>
			closeOpenInterval(entries, open.id, stamp, open.code),
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		noticeWithSkipped(message, scan.unreadable);
		return;
	}
	noticeWithSkipped(`Clocked out ${open.code} — ${open.title}.`, scan.unreadable);
}
