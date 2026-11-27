import { App, normalizePath, TFile, TFolder } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ID,
	MSPRJ_OWNER,
	MSPRJ_TITLE,
	type SubordinateArchetypeId,
	type ThinNoteArchetypeId,
} from './constants';
import { ensureNoteHeadingTitle } from './noteTitle';
import {
	NoteTemplateError,
	assertTemplateFrontmatter,
	readCoreTemplateFormats,
	readNoteTemplate,
	renderNoteTemplate,
	type TemplateSelection,
} from './noteTemplates';
import { isUnderTemplatesPath } from './projectIndex';
import { ensureMsprjPropertyTypes } from './propertyTypes';
import { suggestSubordinateBasename } from './slug';
import { subordinateKind } from './subordinates';
import { newObjectId } from './uuid';

export class CreateSubordinateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CreateSubordinateError';
	}
}

export interface CreateSubordinateFields {
	archetype: SubordinateArchetypeId;
	title: string;
	/** Null leaves the note with no owner. The starting note is the usual owner. */
	owner: TFile | null;
	folder: TFolder;
	noteTemplate: TemplateSelection;
}

export interface CreateThinNoteFields {
	archetype: ThinNoteArchetypeId;
	label: string;
	title: string;
	/** Null leaves the note with no owner. The starting note is the usual owner. */
	owner: TFile | null;
	folder: TFolder;
	noteTemplate: TemplateSelection;
}

/** Create one subordinate document note. The archetype has no behavior of its own. */
export async function createSubordinateNote(
	app: App,
	fields: CreateSubordinateFields,
	templatesPath: string,
): Promise<TFile> {
	const kind = subordinateKind(fields.archetype);
	return createThinNote(
		app,
		{
			archetype: kind.id,
			label: kind.label,
			title: fields.title,
			owner: fields.owner,
			folder: fields.folder,
			noteTemplate: fields.noteTemplate,
		},
		templatesPath,
	);
}

/** Create one contact, resource, or subordinate document note. The archetype has no behavior of its own. */
export async function createThinNote(
	app: App,
	fields: CreateThinNoteFields,
	templatesPath: string,
): Promise<TFile> {
	const kind = { id: fields.archetype, label: fields.label };
	const title = fields.title.trim();
	if (!title) {
		throw new CreateSubordinateError(`${kind.label} title is required.`);
	}
	const basename = suggestSubordinateBasename(kind.id, title);
	if (!basename) {
		throw new CreateSubordinateError(
			`${kind.label} title needs a letter or digit for the file name.`,
		);
	}
	if (isUnderTemplatesPath(fields.folder.path, templatesPath)) {
		throw new CreateSubordinateError(
			`A ${kind.label.toLowerCase()} cannot be created inside the templates path.`,
		);
	}

	let raw: string;
	try {
		raw = await readNoteTemplate(app, templatesPath, kind.id, fields.noteTemplate);
	} catch (err) {
		if (err instanceof NoteTemplateError) throw new CreateSubordinateError(err.message);
		throw err;
	}

	const folderPath = fields.folder.path === '/' ? '' : fields.folder.path;
	const path = normalizePath(folderPath ? `${folderPath}/${basename}.md` : `${basename}.md`);
	if (app.vault.getAbstractFileByPath(path)) {
		throw new CreateSubordinateError(`${kind.label} file already exists: ${path}`);
	}

	const id = newObjectId();
	const ownerLink = fields.owner ? `[[${fields.owner.path}]]` : '';
	const formats = readCoreTemplateFormats(app);
	let rendered: string;
	try {
		rendered = renderNoteTemplate(raw, {
			title: basename,
			now: new Date(),
			dateFormat: formats.dateFormat,
			timeFormat: formats.timeFormat,
			fields: {
				[MSPRJ_ARCHETYPE]: kind.id,
				[MSPRJ_ID]: id,
				[MSPRJ_TITLE]: title,
				[MSPRJ_OWNER]: ownerLink,
			},
		});
		assertTemplateFrontmatter(rendered);
	} catch (err) {
		if (err instanceof NoteTemplateError) throw new CreateSubordinateError(err.message);
		throw err;
	}

	const file = await app.vault.create(path, rendered);
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm[MSPRJ_ARCHETYPE] = kind.id;
		fm[MSPRJ_ID] = id;
		fm[MSPRJ_TITLE] = title;
		fm[MSPRJ_OWNER] = ownerLink || null;
	});
	await ensureNoteHeadingTitle(app, file, title);
	await ensureMsprjPropertyTypes(app);
	return file;
}
