import { App, Notice, TFile } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_TDO_CODE,
	MSPRJ_TDO_DUE,
	MSPRJ_OWNER,
	MSPRJ_TDO_SCHEDULED,
	MSPRJ_TDO_STATUS,
	MSPRJ_TDO_TITLE,
	isTodoArchetype,
} from './constants';
import { isUnderTemplatesPath } from './projectIndex';
import { storedDate } from './taskListFields';
import { taskNoteFromFile, type TaskNoteRef } from './taskNote';
import { nextCycledStatus } from './taskStatuses';
import { todoOwnerFromContext } from './todoContext';
import { frontmatterLinkPath } from './wikilinks';

export interface TodoNoteRef {
	file: TFile;
	/** `todo-00042` or `todo-00042-eng-012-001`. Empty when the property is missing. */
	code: string;
	title: string;
	/** Trimmed `msprj_tdo_status`. Empty when the property is missing or not a string. */
	status: string;
	/** `YYYY-MM-DD` when set. */
	scheduled: string;
	/** `YYYY-MM-DD` when set. */
	due: string;
}

/**
 * Project task named by this to-do's `msprj_owner`.
 * Any other owner, including a missing link, is null. The chain above that owner is not walked.
 */
export function owningTaskOfTodo(
	app: App,
	file: TFile,
	templatesPath: string,
): TaskNoteRef | null {
	const raw = app.metadataCache.getFileCache(file)?.frontmatter?.[MSPRJ_OWNER];
	if (typeof raw !== 'string' || !raw.trim()) return null;
	const path = frontmatterLinkPath(raw);
	if (!path) return null;
	const target = app.metadataCache.getFirstLinkpathDest(path, file.path);
	if (!(target instanceof TFile)) return null;
	return taskNoteFromFile(app, target, templatesPath);
}

export function todoNoteFromFile(
	app: App,
	file: TFile,
	templatesPath: string,
): TodoNoteRef | null {
	if (file.extension !== 'md') return null;
	if (isUnderTemplatesPath(file.path, templatesPath)) return null;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm || !isTodoArchetype(fm[MSPRJ_ARCHETYPE])) return null;
	const titleRaw = fm[MSPRJ_TDO_TITLE];
	const codeRaw = fm[MSPRJ_TDO_CODE];
	const statusRaw = fm[MSPRJ_TDO_STATUS];
	const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : file.basename;
	const code = typeof codeRaw === 'string' ? codeRaw.trim() : '';
	const status = typeof statusRaw === 'string' ? statusRaw.trim() : '';
	return {
		file,
		code,
		title,
		status,
		scheduled: storedDate(fm[MSPRJ_TDO_SCHEDULED]) ?? '',
		due: storedDate(fm[MSPRJ_TDO_DUE]) ?? '',
	};
}

/**
 * Owner to store on a new to-do.
 * The context note owns it, except when that note is a to-do: then the owner
 * is that to-do's owner, and a missing or to-do target means unowned.
 */
export function ownerForNewTodo(app: App, context: TFile | null): TFile | null {
	if (!context) return null;
	const fm = app.metadataCache.getFileCache(context)?.frontmatter;
	const choice = todoOwnerFromContext(fm?.[MSPRJ_ARCHETYPE]);
	if (choice === 'none') return null;
	if (choice === 'context') return context;
	const raw = fm?.[MSPRJ_OWNER];
	if (typeof raw !== 'string' || !raw.trim()) return null;
	const path = frontmatterLinkPath(raw);
	if (!path) return null;
	const target = app.metadataCache.getFirstLinkpathDest(path, context.path);
	if (!(target instanceof TFile)) return null;
	const targetArchetype = app.metadataCache.getFileCache(target)?.frontmatter?.[MSPRJ_ARCHETYPE];
	if (isTodoArchetype(targetArchetype)) return null;
	return target;
}

export async function writeTodoStatus(app: App, file: TFile, status: string): Promise<void> {
	try {
		await app.fileManager.processFrontMatter(file, (fm) => {
			if (fm[MSPRJ_TDO_STATUS] === status) return;
			fm[MSPRJ_TDO_STATUS] = status;
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		new Notice(message);
		console.error('Muse Projects: to-do status write failed', err);
	}
}

/** Advance `msprj_tdo_status` using the value on disk at write time. */
export async function cycleTodoStatus(app: App, file: TFile): Promise<void> {
	try {
		await app.fileManager.processFrontMatter(file, (fm) => {
			const next = nextCycledStatus(fm[MSPRJ_TDO_STATUS]);
			if (fm[MSPRJ_TDO_STATUS] === next) return;
			fm[MSPRJ_TDO_STATUS] = next;
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		new Notice(message);
		console.error('Muse Projects: to-do status cycle failed', err);
	}
}
