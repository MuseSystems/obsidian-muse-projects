import { App, normalizePath, TFile, TFolder } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ARCHETYPE_DOCUMENT,
	MSPRJ_DOC_TODO_DIR,
	MSPRJ_ID,
	MSPRJ_OWNER,
	MSPRJ_TITLE,
} from './constants';
import { ensureNoteHeadingTitle } from './noteTitle';
import {
	NoteTemplateError,
	assertTemplateFrontmatter,
	builtinNoteTemplate,
	frontmatterField,
	readCoreTemplateFormats,
	renderNoteTemplate,
} from './noteTemplates';
import { isUnderTemplatesPath } from './projectIndex';
import { ensureMsprjPropertyTypes } from './propertyTypes';
import { applyStockMarkdownTokens } from './scaffold';
import {
	ensureVaultFolder,
	placeSkeletonFolder,
	removePlacedSkeleton,
	skeletonDestinationPath,
	SkeletonPlaceError,
	type PlacedSkeleton,
} from './skeletons';
import { normalizeNoteFilename, suggestFolderSlug } from './slug';
import { createdTodoDir } from './todoContext';
import { newObjectId } from './uuid';

export class CreateDocumentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CreateDocumentError';
	}
}

export interface CreateDocumentFields {
	title: string;
	/** File name with or without `.md`. */
	filename: string;
	/** Null leaves the document with no owner. */
	owner: TFile | null;
}

/**
 * Copy a document skeleton into `destination/<folder name>/`.
 * The note is that layout's `_doc.md`, renamed to the chosen file name.
 * `skeleton` null is the empty layout and writes the built-in note.
 * A failure after the folder exists deletes that folder.
 */
export async function createDocumentNote(
	app: App,
	destination: TFolder,
	folderName: string,
	fields: CreateDocumentFields,
	templatesPath: string,
	skeleton: TFolder | null,
): Promise<TFile> {
	const folder = folderName.trim();
	if (!folder) {
		throw new CreateDocumentError('Document folder name is required.');
	}
	if (folder.includes('/') || folder.includes('\\')) {
		throw new CreateDocumentError('Document folder name must not contain path separators.');
	}
	const title = fields.title.trim();
	if (!title) {
		throw new CreateDocumentError('Document title is required.');
	}
	if (!suggestFolderSlug(title)) {
		throw new CreateDocumentError('Document title needs a letter or digit for the file name.');
	}
	const filename = normalizeNoteFilename(fields.filename);
	if (!filename) {
		const raw = fields.filename.trim();
		throw new CreateDocumentError(
			raw.includes('/') || raw.includes('\\')
				? 'Document note file name must not contain a path.'
				: 'Document note file name is required.',
		);
	}
	if (isUnderTemplatesPath(destination.path, templatesPath)) {
		throw new CreateDocumentError('A document cannot be created inside the templates path.');
	}

	const id = newObjectId();
	const ownerLink = fields.owner ? `[[${fields.owner.path}]]` : '';
	const now = new Date();
	const tokenFields = {
		[MSPRJ_ARCHETYPE]: MSPRJ_ARCHETYPE_DOCUMENT,
		[MSPRJ_ID]: id,
		[MSPRJ_TITLE]: title,
		[MSPRJ_OWNER]: ownerLink,
	};
	const destPath = skeletonDestinationPath(destination.path, folder);
	let placed: PlacedSkeleton;
	try {
		placed = await placeSkeletonFolder(app, skeleton, destPath, filename, 'document');
	} catch (err) {
		if (err instanceof SkeletonPlaceError) throw new CreateDocumentError(err.message);
		throw err;
	}

	try {
		const formats = readCoreTemplateFormats(app);
		await applyStockMarkdownTokens(app, placed.folder, {
			now,
			dateFormat: formats.dateFormat,
			timeFormat: formats.timeFormat,
			fields: tokenFields,
		});
		const file = await materializeDocumentNote(app, placed, filename, tokenFields, now, formats);
		const todoDir = createdTodoDir(
			placed.folder.path,
			frontmatterField(await app.vault.read(file), MSPRJ_DOC_TODO_DIR),
			MSPRJ_DOC_TODO_DIR,
		);
		if (todoDir.kind === 'invalid') throw new CreateDocumentError(todoDir.message);
		if (todoDir.kind === 'folder') {
			try {
				await ensureVaultFolder(app, todoDir.vaultPath);
			} catch (err) {
				if (err instanceof SkeletonPlaceError) throw new CreateDocumentError(err.message);
				throw err;
			}
		}
		await app.fileManager.processFrontMatter(file, (fm) => {
			fm[MSPRJ_ARCHETYPE] = MSPRJ_ARCHETYPE_DOCUMENT;
			fm[MSPRJ_ID] = id;
			fm[MSPRJ_TITLE] = title;
			fm[MSPRJ_OWNER] = ownerLink || null;
			fm[MSPRJ_DOC_TODO_DIR] = todoDir.kind === 'folder' ? todoDir.vaultPath : null;
		});
		await ensureNoteHeadingTitle(app, file, title);
		await ensureMsprjPropertyTypes(app);
		return file;
	} catch (err) {
		const removed = await removePlacedSkeleton(app, placed.folder);
		if (!removed) {
			const message = err instanceof Error ? err.message : String(err);
			throw new CreateDocumentError(`${message} The new folder was left at ${placed.folder.path}.`);
		}
		throw err;
	}
}

async function materializeDocumentNote(
	app: App,
	placed: PlacedSkeleton,
	filename: string,
	tokenFields: Record<string, string>,
	now: Date,
	formats: { dateFormat: string; timeFormat: string },
): Promise<TFile> {
	if (placed.note) {
		try {
			assertTemplateFrontmatter(await app.vault.read(placed.note));
		} catch (err) {
			if (err instanceof NoteTemplateError) throw new CreateDocumentError(err.message);
			throw err;
		}
		return placed.note;
	}
	let rendered: string;
	try {
		rendered = renderNoteTemplate(builtinNoteTemplate(MSPRJ_ARCHETYPE_DOCUMENT), {
			title: filename.slice(0, -3),
			now,
			dateFormat: formats.dateFormat,
			timeFormat: formats.timeFormat,
			fields: tokenFields,
		});
		assertTemplateFrontmatter(rendered);
	} catch (err) {
		if (err instanceof NoteTemplateError) throw new CreateDocumentError(err.message);
		throw err;
	}
	const path = normalizePath(`${placed.folder.path}/${filename}`);
	if (app.vault.getAbstractFileByPath(path)) {
		throw new CreateDocumentError(`Document file already exists: ${path}`);
	}
	return app.vault.create(path, rendered);
}
