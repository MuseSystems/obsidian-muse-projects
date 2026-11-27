import { App, normalizePath, TFile, TFolder } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ARCHETYPE_TODO,
	MSPRJ_ID,
	MSPRJ_OWNER,
	MSPRJ_TDO_BLOCKED_BY,
	MSPRJ_TDO_CODE,
	MSPRJ_TDO_COMPLETED,
	MSPRJ_TDO_DUE,
	MSPRJ_TDO_SCHEDULED,
	MSPRJ_TDO_STATUS,
	MSPRJ_TDO_TITLE,
	MSPRJ_TODO,
	MSPRJ_TODO_ID_PAD,
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
import { ensureMsprjPropertyTypes } from './propertyTypes';
import { formatTodoCode, suggestFolderSlug, suggestTodoBasename } from './slug';
import { storedDate } from './taskListFields';
import { firstCycledStatus, isTerminalStatus } from './taskStatuses';
import { artifactCodeForTodoOwner } from './todoContext';
import { ownerForNewTodo } from './todoNote';
import { newObjectId } from './uuid';

export class CreateTodoError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CreateTodoError';
	}
}

export interface CreateTodoFields {
	title: string;
	scheduled: string | null;
	/** Null files the to-do with no owner. */
	owner: TFile | null;
	folder: TFolder;
	noteTemplate: TemplateSelection;
	/** Takes the next global number and advances the setting. Called once a template is readable. */
	allocateNumber: () => Promise<number>;
}

/** Create a to-do note in `folder`. An archetype owner is stored as a wikilink. */
export async function createTodoNote(
	app: App,
	fields: CreateTodoFields,
	templatesPath: string,
): Promise<TFile> {
	const title = fields.title.trim();
	if (!title) {
		throw new CreateTodoError('To-do title is required.');
	}
	if (!suggestFolderSlug(title)) {
		throw new CreateTodoError('To-do title needs a letter or digit for the file name.');
	}

	const scheduled =
		typeof fields.scheduled === 'string' && fields.scheduled.trim()
			? fields.scheduled.trim()
			: null;
	if (scheduled && !isCalendarDate(scheduled)) {
		throw new CreateTodoError('Scheduled date must be a real YYYY-MM-DD date or empty.');
	}

	let raw: string;
	try {
		raw = await readNoteTemplate(
			app,
			templatesPath,
			MSPRJ_ARCHETYPE_TODO,
			fields.noteTemplate,
		);
	} catch (err) {
		if (err instanceof NoteTemplateError) {
			throw new CreateTodoError(err.message);
		}
		throw err;
	}

	const number = await fields.allocateNumber();
	const owner = ownerForNewTodo(app, fields.owner);
	const code = formatTodoCode(number, artifactCodeFromOwner(app, owner), MSPRJ_TODO_ID_PAD);
	const basename = suggestTodoBasename(code, title);
	const folderPath = fields.folder.path === '/' ? '' : fields.folder.path;
	const path = normalizePath(folderPath ? `${folderPath}/${basename}.md` : `${basename}.md`);
	if (app.vault.getAbstractFileByPath(path)) {
		throw new CreateTodoError(`To-do file already exists: ${path}`);
	}

	const id = newObjectId();
	const ownerLink = owner ? `[[${owner.path}]]` : '';
	const formats = readCoreTemplateFormats(app);
	let rendered: string;
	try {
		rendered = renderNoteTemplate(raw, {
			title: basename,
			now: new Date(),
			dateFormat: formats.dateFormat,
			timeFormat: formats.timeFormat,
			fields: {
				[MSPRJ_ARCHETYPE]: MSPRJ_ARCHETYPE_TODO,
				[MSPRJ_ID]: id,
				[MSPRJ_TDO_TITLE]: title,
				[MSPRJ_TDO_CODE]: code,
				[MSPRJ_OWNER]: ownerLink,
				[MSPRJ_TDO_SCHEDULED]: scheduled ?? '',
			},
		});
		assertTemplateFrontmatter(rendered);
	} catch (err) {
		if (err instanceof NoteTemplateError) {
			throw new CreateTodoError(err.message);
		}
		throw err;
	}

	const file = await app.vault.create(path, rendered);
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm[MSPRJ_ARCHETYPE] = MSPRJ_ARCHETYPE_TODO;
		fm[MSPRJ_ID] = id;
		fm[MSPRJ_TDO_TITLE] = title;
		fm[MSPRJ_TDO_CODE] = code;
		fm[MSPRJ_OWNER] = ownerLink || null;
		fm[MSPRJ_TDO_SCHEDULED] = scheduled;
		if (typeof fm[MSPRJ_TODO] !== 'boolean') fm[MSPRJ_TODO] = true;
		if (typeof fm[MSPRJ_TDO_STATUS] !== 'string' || !fm[MSPRJ_TDO_STATUS].trim()) {
			fm[MSPRJ_TDO_STATUS] = firstCycledStatus();
		}
		if (isTerminalStatus(fm[MSPRJ_TDO_STATUS])) {
			if (storedDate(fm[MSPRJ_TDO_COMPLETED]) === null) {
				fm[MSPRJ_TDO_COMPLETED] = todayLocalISODate();
			}
		} else {
			fm[MSPRJ_TDO_COMPLETED] = null;
		}
		if (fm[MSPRJ_TDO_DUE] === undefined) fm[MSPRJ_TDO_DUE] = null;
		if (fm[MSPRJ_TDO_BLOCKED_BY] === undefined) fm[MSPRJ_TDO_BLOCKED_BY] = [];
	});

	await ensureNoteHeadingTitle(app, file, `${code} - ${title}`);
	await ensureMsprjPropertyTypes(app);
	return file;
}

function artifactCodeFromOwner(app: App, owner: TFile | null): string | null {
	if (!owner) return null;
	const fm = app.metadataCache.getFileCache(owner)?.frontmatter;
	if (!fm) return null;
	return artifactCodeForTodoOwner(fm[MSPRJ_ARCHETYPE], fm);
}
