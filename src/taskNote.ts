import { App, Notice, TFile } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_PRJ_CODE,
	MSPRJ_PRJ_NAME,
	MSPRJ_TSK_BILLABLE,
	MSPRJ_TSK_CODE,
	MSPRJ_TSK_DUE,
	MSPRJ_TSK_PROJECT_CODE,
	MSPRJ_TSK_SCHEDULED,
	MSPRJ_TSK_STATUS,
	MSPRJ_TSK_TITLE,
	isTaskArchetype,
} from './constants';
import { isUnderTemplatesPath } from './projectIndex';
import { nextCycledStatus } from './taskStatuses';
import { nearestProjectFile } from './ownershipResolve';

export interface TaskNoteRef {
	file: TFile;
	code: string;
	title: string;
	/** Trimmed `msprj_tsk_status`. Empty when the property is missing or not a string. */
	status: string;
	/** Project name when the link resolves, otherwise the project code. */
	project: string;
	/** `YYYY-MM-DD` when set. */
	scheduled: string;
	/** `YYYY-MM-DD` when set. */
	due: string;
	billable: boolean;
}

/** Project code and name for a task. Name is empty when the project link does not resolve. */
export interface TaskProjectIdentity {
	code: string;
	name: string;
}

export function taskNoteFromFile(
	app: App,
	file: TFile,
	templatesPath: string,
): TaskNoteRef | null {
	if (file.extension !== 'md') return null;
	if (isUnderTemplatesPath(file.path, templatesPath)) return null;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm || !isTaskArchetype(fm[MSPRJ_ARCHETYPE])) return null;
	const codeRaw = fm[MSPRJ_TSK_CODE];
	const titleRaw = fm[MSPRJ_TSK_TITLE];
	const statusRaw = fm[MSPRJ_TSK_STATUS];
	const code = typeof codeRaw === 'string' && codeRaw.trim() ? codeRaw.trim() : file.basename;
	const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : file.basename;
	const status = typeof statusRaw === 'string' ? statusRaw.trim() : '';
	return {
		file,
		code,
		title,
		status,
		project: projectLabel(app, file, fm),
		scheduled: dateField(fm[MSPRJ_TSK_SCHEDULED]),
		due: dateField(fm[MSPRJ_TSK_DUE]),
		billable: fm[MSPRJ_TSK_BILLABLE] === true,
	};
}

function projectLabel(app: App, source: TFile, fm: Record<string, unknown>): string {
	const linked = linkedProject(app, source);
	if (linked?.name) {
		return linked.name;
	}
	const codeRaw = fm[MSPRJ_TSK_PROJECT_CODE];
	return typeof codeRaw === 'string' ? codeRaw.trim() : '';
}

/** Code from the task, otherwise the linked project. Name from the linked project. */
export function taskProjectIdentity(app: App, file: TFile): TaskProjectIdentity {
	const fm = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
	const linked = linkedProject(app, file);
	const stored = fm[MSPRJ_TSK_PROJECT_CODE];
	const storedCode = typeof stored === 'string' ? stored.trim() : '';
	return {
		code: storedCode || linked?.code || '',
		name: linked?.name ?? '',
	};
}

function linkedProject(app: App, source: TFile): TaskProjectIdentity | null {
	const projectFile = nearestProjectFile(app, source);
	if (!projectFile) return null;
	const record = app.metadataCache.getFileCache(projectFile)?.frontmatter;
	const nameRaw = record?.[MSPRJ_PRJ_NAME];
	const codeRaw = record?.[MSPRJ_PRJ_CODE];
	return {
		code: typeof codeRaw === 'string' ? codeRaw.trim() : '',
		name: typeof nameRaw === 'string' ? nameRaw.trim() : '',
	};
}

function dateField(value: unknown): string {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const month = String(value.getMonth() + 1).padStart(2, '0');
		const day = String(value.getDate()).padStart(2, '0');
		return `${value.getFullYear()}-${month}-${day}`;
	}
	if (typeof value !== 'string') return '';
	const text = value.trim();
	if (!text) return '';
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
	return match?.[1] ?? text;
}

export function listTaskNotes(app: App, templatesPath: string): TaskNoteRef[] {
	const tasks: TaskNoteRef[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const task = taskNoteFromFile(app, file, templatesPath);
		if (task) tasks.push(task);
	}
	tasks.sort((a, b) => a.code.localeCompare(b.code) || a.file.path.localeCompare(b.file.path));
	return tasks;
}

export async function writeTaskStatus(app: App, file: TFile, status: string): Promise<void> {
	try {
		await app.fileManager.processFrontMatter(file, (fm) => {
			if (fm[MSPRJ_TSK_STATUS] === status) return;
			fm[MSPRJ_TSK_STATUS] = status;
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		new Notice(message);
		console.error('Muse Projects: status write failed', err);
	}
}

/** Advance `msprj_tsk_status` using the value on disk at write time. */
export async function cycleTaskStatus(app: App, file: TFile): Promise<void> {
	try {
		await app.fileManager.processFrontMatter(file, (fm) => {
			const next = nextCycledStatus(fm[MSPRJ_TSK_STATUS]);
			if (fm[MSPRJ_TSK_STATUS] === next) return;
			fm[MSPRJ_TSK_STATUS] = next;
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		new Notice(message);
		console.error('Muse Projects: status cycle failed', err);
	}
}
