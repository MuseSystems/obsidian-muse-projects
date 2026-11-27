import { App, normalizePath, TFile } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ARCHETYPE_TASK,
	MSPRJ_ID,
	MSPRJ_OWNER,
	MSPRJ_PRJ_NEXT_TASK_ID,
	MSPRJ_TASK_ID_PAD,
	MSPRJ_TODO,
	MSPRJ_TSK_BILLABLE,
	MSPRJ_TSK_BLOCKED_BY,
	MSPRJ_TSK_CODE,
	MSPRJ_TSK_COMPLETED,
	MSPRJ_TSK_DUE,
	MSPRJ_TSK_GENERAL_ADMIN,
	MSPRJ_TSK_ORG,
	MSPRJ_TSK_PROJECT_CODE,
	MSPRJ_TSK_SCHEDULED,
	MSPRJ_TSK_STATUS,
	MSPRJ_TSK_TIME_ENTRIES,
	MSPRJ_TSK_TITLE,
} from './constants';
import { isCalendarDate, todayLocalISODate } from './dates';
import { ensureNoteHeadingTitle } from './noteTitle';
import {
	NoteTemplateError,
	assertTemplateFrontmatter,
	readCoreTemplateFormats,
	readNoteTemplate,
	renderNoteTemplate,
	type TemplateSelection,
} from './noteTemplates';
import { taskFactsForOwnerProject } from './ownershipResolve';
import type { ResolvedProject } from './projectResolve';
import { ensureMsprjPropertyTypes } from './propertyTypes';
import { formatTaskCode, suggestTaskBasename } from './slug';
import {
	storedDate,
} from './taskListFields';
import { firstCycledStatus, isTerminalStatus } from './taskStatuses';
import { newObjectId } from './uuid';

export class CreateTaskError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CreateTaskError';
	}
}

export interface CreateTaskFields {
	title: string;
	scheduled: string | null;
	billable: boolean;
	noteTemplate: TemplateSelection;
}

/**
 * Allocate next task id on the project note, create task sibling, bump counter.
 */
export async function createTaskNote(
	app: App,
	project: ResolvedProject,
	fields: CreateTaskFields,
	templatesPath: string,
): Promise<TFile> {
	const title = fields.title.trim();
	if (!title) {
		throw new CreateTaskError('Task title is required.');
	}

	const folder = project.file.parent;
	if (!folder) {
		throw new CreateTaskError('Project note has no parent folder.');
	}

	let raw: string;
	try {
		raw = await readNoteTemplate(
			app,
			templatesPath,
			MSPRJ_ARCHETYPE_TASK,
			fields.noteTemplate,
		);
	} catch (err) {
		if (err instanceof NoteTemplateError) {
			throw new CreateTaskError(err.message);
		}
		throw err;
	}

	const scheduled =
		typeof fields.scheduled === 'string' && fields.scheduled.trim()
			? fields.scheduled.trim()
			: null;
	if (scheduled && !isCalendarDate(scheduled)) {
		throw new CreateTaskError('Scheduled date must be a real YYYY-MM-DD date or empty.');
	}

	const formats = readCoreTemplateFormats(app);
	const now = new Date();
	const facts = taskFactsForOwnerProject(app, project.file);
	if (!facts) {
		throw new CreateTaskError("This project's owner chain cannot be recovered.");
	}
	const cacheFm = app.metadataCache.getFileCache(project.file)?.frontmatter;
	const cachedRaw = cacheFm?.[MSPRJ_PRJ_NEXT_TASK_ID];
	const cachedId =
		typeof cachedRaw === 'number' && Number.isInteger(cachedRaw) && cachedRaw >= 1
			? cachedRaw
			: 1;
	const projectLink = `[[${project.file.path}]]`;
	const id = newObjectId();

	const compose = (taskId: number) => {
		const taskCode = formatTaskCode(project.code, taskId, MSPRJ_TASK_ID_PAD);
		const basename = suggestTaskBasename(taskCode, title);
		const path = normalizePath(`${folder.path}/${basename}.md`);
		const rendered = renderNoteTemplate(raw, {
			title: basename,
			now,
			dateFormat: formats.dateFormat,
			timeFormat: formats.timeFormat,
			fields: {
				[MSPRJ_ARCHETYPE]: MSPRJ_ARCHETYPE_TASK,
				[MSPRJ_ID]: id,
				[MSPRJ_TSK_TITLE]: title,
				[MSPRJ_TSK_CODE]: taskCode,
				[MSPRJ_OWNER]: projectLink,
				[MSPRJ_TSK_PROJECT_CODE]: facts.projectCode ?? project.code,
				[MSPRJ_TSK_ORG]: facts.orgCode,
				[MSPRJ_TSK_GENERAL_ADMIN]: facts.generalAdmin ? 'true' : 'false',
				[MSPRJ_TSK_BILLABLE]: fields.billable ? 'true' : 'false',
				[MSPRJ_TODO]: project.taskTodo ? 'true' : 'false',
				[MSPRJ_TSK_SCHEDULED]: scheduled ?? '',
			},
		});
		assertTemplateFrontmatter(rendered);
		return { taskCode, path, rendered };
	};

	let built: ReturnType<typeof compose>;
	try {
		built = compose(cachedId);
	} catch (err) {
		if (err instanceof NoteTemplateError) {
			throw new CreateTaskError(err.message);
		}
		throw err;
	}

	let allocatedId = 0;
	await app.fileManager.processFrontMatter(project.file, (fm) => {
		const nextRaw = fm[MSPRJ_PRJ_NEXT_TASK_ID];
		const current =
			typeof nextRaw === 'number' && Number.isInteger(nextRaw) && nextRaw >= 1 ? nextRaw : 1;
		allocatedId = current;
		fm[MSPRJ_PRJ_NEXT_TASK_ID] = current + 1;
	});

	if (!allocatedId) {
		throw new CreateTaskError('Failed to allocate task code from project.');
	}

	if (allocatedId !== cachedId) {
		try {
			built = compose(allocatedId);
		} catch (err) {
			if (err instanceof NoteTemplateError) {
				throw new CreateTaskError(`${err.message} The next task id was already advanced.`);
			}
			throw err;
		}
	}

	const { taskCode, path, rendered } = built;
	if (app.vault.getAbstractFileByPath(path)) {
		throw new CreateTaskError(`Task file already exists: ${path}`);
	}

	const file = await app.vault.create(path, rendered);
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm[MSPRJ_ARCHETYPE] = MSPRJ_ARCHETYPE_TASK;
		fm[MSPRJ_ID] = id;
		fm[MSPRJ_TSK_TITLE] = title;
		fm[MSPRJ_TSK_CODE] = taskCode;
		fm[MSPRJ_OWNER] = projectLink;
		fm[MSPRJ_TSK_PROJECT_CODE] = facts.projectCode ?? project.code;
		fm[MSPRJ_TSK_ORG] = facts.orgCode;
		fm[MSPRJ_TSK_GENERAL_ADMIN] = facts.generalAdmin;
		fm[MSPRJ_TSK_BILLABLE] = fields.billable;
		fm[MSPRJ_TSK_SCHEDULED] = scheduled;
		if (typeof fm[MSPRJ_TSK_STATUS] !== 'string' || !fm[MSPRJ_TSK_STATUS].trim()) {
			fm[MSPRJ_TSK_STATUS] = firstCycledStatus();
		}
		if (isTerminalStatus(fm[MSPRJ_TSK_STATUS])) {
			if (storedDate(fm[MSPRJ_TSK_COMPLETED]) === null) {
				fm[MSPRJ_TSK_COMPLETED] = todayLocalISODate();
			}
		} else {
			fm[MSPRJ_TSK_COMPLETED] = null;
		}
		if (fm[MSPRJ_TSK_DUE] === undefined) fm[MSPRJ_TSK_DUE] = null;
		if (fm[MSPRJ_TSK_BLOCKED_BY] === undefined) fm[MSPRJ_TSK_BLOCKED_BY] = [];
		if (fm[MSPRJ_TSK_TIME_ENTRIES] === undefined) fm[MSPRJ_TSK_TIME_ENTRIES] = [];
		fm[MSPRJ_TODO] = project.taskTodo;
	});

	await ensureNoteHeadingTitle(app, file, `${taskCode} - ${title}`);
	await ensureMsprjPropertyTypes(app);

	return file;
}
