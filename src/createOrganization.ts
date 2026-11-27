import { App, normalizePath, TFile, TFolder } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ARCHETYPE_ORGANIZATION,
	MSPRJ_ID,
	MSPRJ_ORG_BILLABLE,
	MSPRJ_ORG_CLOCK_FORMAT,
	MSPRJ_ORG_CODE,
	MSPRJ_ORG_DURATION_FORMAT,
	MSPRJ_ORG_NAME,
	MSPRJ_ORG_SKEL_PROJECT,
	MSPRJ_ORG_TODO_DIR,
	MSPRJ_ORG_TPL_TASK,
	MSPRJ_ORG_WEEK_START,
	MSPRJ_OWNER,
} from './constants';
import { findOrganizationByCode, organizationFromFile } from './orgIndex';
import { chainFromFile } from './ownershipResolve';
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
import { identifierCodeError, normalizeNoteFilename, normalizeOrganizationCode } from './slug';
import { createdTodoDir } from './todoContext';
import { newObjectId } from './uuid';
import { parseClockFormat, type ClockFormat } from './clockFormat';
import { parseDurationFormat, type DurationFormat } from './durationFormat';
import { parseWeekStart, type WeekStart } from './weekStart';

export class CreateOrganizationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CreateOrganizationError';
	}
}

export interface CreateOrganizationFields {
	name: string;
	code: string;
	billable: boolean;
	/** Stored on the note. Organization reports use this, not the plugin standard. */
	weekStart: WeekStart;
	/** Stored on the note. Organization reports use this, not the plugin standard. */
	durationFormat: DurationFormat;
	/** Stored on the note. Organization reports use this for civil clock times, not the plugin standard. */
	clockFormat: ClockFormat;
	/** File name with or without `.md`. */
	filename: string;
	/** Stored when this organization overrides the vault default project skeleton. */
	projectSkeletonStem: string | null;
	/** Stored when this organization overrides the vault default task note template. */
	taskTemplateStem: string | null;
	/** Parent organization. Null leaves this organization a root. */
	owner: TFile | null;
}

/**
 * Copy an organization skeleton into `destination/<folder name>/`.
 * The note is that layout's `_org.md`, renamed to the chosen file name.
 * `skeleton` null is the empty layout and writes the built-in note.
 * The code must be unique across organization notes outside the templates root.
 * `owner` null leaves a root. A parent must be an organization note whose chain
 * can be walked, and that note must sit outside the new folder.
 * A failure after the folder exists deletes that folder.
 */
export async function createOrganizationNote(
	app: App,
	destination: TFolder,
	folderName: string,
	fields: CreateOrganizationFields,
	templatesPath: string,
	skeleton: TFolder | null,
): Promise<TFile> {
	const folder = folderName.trim();
	if (!folder) {
		throw new CreateOrganizationError('Organization folder name is required.');
	}
	if (folder.includes('/') || folder.includes('\\')) {
		throw new CreateOrganizationError('Organization folder name must not contain path separators.');
	}

	const name = fields.name.trim();
	if (!name) {
		throw new CreateOrganizationError('Organization name is required.');
	}
	const code = normalizeOrganizationCode(fields.code);
	if (!code) {
		throw new CreateOrganizationError('Organization code is required.');
	}
	const codeError = identifierCodeError(code);
	if (codeError) {
		throw new CreateOrganizationError(`${MSPRJ_ORG_CODE}: ${codeError}`);
	}
	if (typeof fields.billable !== 'boolean') {
		throw new CreateOrganizationError(
			`${MSPRJ_ORG_BILLABLE} is required (choose billable or non-billable).`,
		);
	}
	const weekStart = parseWeekStart(fields.weekStart);
	if (!weekStart) {
		throw new CreateOrganizationError(
			`${MSPRJ_ORG_WEEK_START} must be monday (Monday–Sunday), sunday (Sunday–Saturday), or saturday (Saturday–Friday).`,
		);
	}
	const durationFormat = parseDurationFormat(fields.durationFormat);
	if (!durationFormat) {
		throw new CreateOrganizationError(
			`${MSPRJ_ORG_DURATION_FORMAT} must be hours-minutes or decimal-hours.`,
		);
	}
	const clockFormat = parseClockFormat(fields.clockFormat);
	if (!clockFormat) {
		throw new CreateOrganizationError(
			`${MSPRJ_ORG_CLOCK_FORMAT} must be 24-hour or 12-hour.`,
		);
	}

	const duplicate = findOrganizationByCode(app, code, templatesPath);
	if (duplicate) {
		throw new CreateOrganizationError(
			`${MSPRJ_ORG_CODE} "${code}" is already used by ${duplicate.file.path}.`,
		);
	}

	const filename = normalizeNoteFilename(fields.filename);
	if (!filename) {
		const raw = fields.filename.trim();
		throw new CreateOrganizationError(
			raw.includes('/') || raw.includes('\\')
				? 'Organization note file name must not contain a path.'
				: 'Organization note file name is required.',
		);
	}

	if (isUnderTemplatesPath(destination.path, templatesPath)) {
		throw new CreateOrganizationError('An organization cannot be created inside the templates path.');
	}

	const id = newObjectId();
	const now = new Date();
	const destPath = skeletonDestinationPath(destination.path, folder);
	const ownerLink = organizationOwnerLink(app, fields.owner, templatesPath, destPath);
	const tokenFields = {
		[MSPRJ_ARCHETYPE]: MSPRJ_ARCHETYPE_ORGANIZATION,
		[MSPRJ_ID]: id,
		[MSPRJ_OWNER]: ownerLink ?? '',
		[MSPRJ_ORG_NAME]: name,
		[MSPRJ_ORG_CODE]: code,
		[MSPRJ_ORG_BILLABLE]: fields.billable ? 'true' : 'false',
		[MSPRJ_ORG_WEEK_START]: weekStart,
		[MSPRJ_ORG_DURATION_FORMAT]: durationFormat,
		[MSPRJ_ORG_CLOCK_FORMAT]: clockFormat,
	};
	let placed: PlacedSkeleton;
	try {
		placed = await placeSkeletonFolder(app, skeleton, destPath, filename, 'organization');
	} catch (err) {
		if (err instanceof SkeletonPlaceError) {
			throw new CreateOrganizationError(err.message);
		}
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
		const file = await materializeOrganizationNote(
			app,
			placed,
			filename,
			tokenFields,
			now,
			formats,
		);
		const todoDir = createdTodoDir(
			placed.folder.path,
			frontmatterField(await app.vault.read(file), MSPRJ_ORG_TODO_DIR),
			MSPRJ_ORG_TODO_DIR,
		);
		if (todoDir.kind === 'invalid') throw new CreateOrganizationError(todoDir.message);
		if (todoDir.kind === 'folder') {
			try {
				await ensureVaultFolder(app, todoDir.vaultPath);
			} catch (err) {
				if (err instanceof SkeletonPlaceError) throw new CreateOrganizationError(err.message);
				throw err;
			}
		}
		await app.fileManager.processFrontMatter(file, (fm) => {
			fm[MSPRJ_ARCHETYPE] = MSPRJ_ARCHETYPE_ORGANIZATION;
			fm[MSPRJ_ID] = id;
			fm[MSPRJ_OWNER] = ownerLink;
			fm[MSPRJ_ORG_NAME] = name;
			fm[MSPRJ_ORG_CODE] = code;
			fm[MSPRJ_ORG_BILLABLE] = fields.billable;
			fm[MSPRJ_ORG_WEEK_START] = weekStart;
			fm[MSPRJ_ORG_DURATION_FORMAT] = durationFormat;
			fm[MSPRJ_ORG_CLOCK_FORMAT] = clockFormat;
			fm[MSPRJ_ORG_TODO_DIR] = todoDir.kind === 'folder' ? todoDir.vaultPath : null;
			if (fields.projectSkeletonStem) {
				fm[MSPRJ_ORG_SKEL_PROJECT] = fields.projectSkeletonStem;
			} else {
				delete fm[MSPRJ_ORG_SKEL_PROJECT];
			}
			if (fields.taskTemplateStem) {
				fm[MSPRJ_ORG_TPL_TASK] = fields.taskTemplateStem;
			} else {
				delete fm[MSPRJ_ORG_TPL_TASK];
			}
		});
		await ensureNoteHeadingTitle(app, file, `${code} - ${name}`);
		await ensureMsprjPropertyTypes(app);
		return file;
	} catch (err) {
		const removed = await removePlacedSkeleton(app, placed.folder);
		if (!removed) {
			const message = err instanceof Error ? err.message : String(err);
			throw new CreateOrganizationError(`${message} The new folder was left at ${placed.folder.path}.`);
		}
		throw err;
	}
}

/**
 * Wikilink to the parent organization, or null for a root.
 * The parent is an organization note whose own chain can be walked, and it does not sit inside the new folder.
 */
function organizationOwnerLink(
	app: App,
	owner: TFile | null,
	templatesPath: string,
	newFolderPath: string,
): string | null {
	if (!owner) return null;
	const parent = organizationFromFile(app, owner, templatesPath);
	if (!parent) {
		throw new CreateOrganizationError('A child organization is owned by an organization note.');
	}
	const walked = chainFromFile(app, parent.file);
	if (!walked.ok) {
		throw new CreateOrganizationError(
			"The parent organization's owner chain cannot be recovered.",
		);
	}
	const ownerPath = parent.file.path;
	if (ownerPath === newFolderPath || ownerPath.startsWith(`${newFolderPath}/`)) {
		throw new CreateOrganizationError(
			'An organization cannot be owned by a note inside its own folder.',
		);
	}
	return `[[${ownerPath}]]`;
}

async function materializeOrganizationNote(
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
			if (err instanceof NoteTemplateError) {
				throw new CreateOrganizationError(err.message);
			}
			throw err;
		}
		return placed.note;
	}
	let rendered: string;
	try {
		rendered = renderNoteTemplate(builtinNoteTemplate(MSPRJ_ARCHETYPE_ORGANIZATION), {
			title: filename.slice(0, -3),
			now,
			dateFormat: formats.dateFormat,
			timeFormat: formats.timeFormat,
			fields: tokenFields,
		});
		assertTemplateFrontmatter(rendered);
	} catch (err) {
		if (err instanceof NoteTemplateError) {
			throw new CreateOrganizationError(err.message);
		}
		throw err;
	}
	const path = normalizePath(`${placed.folder.path}/${filename}`);
	if (app.vault.getAbstractFileByPath(path)) {
		throw new CreateOrganizationError(`Organization file already exists: ${path}`);
	}
	return app.vault.create(path, rendered);
}
